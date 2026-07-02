const KEY='financas_maycon_v2';
const money=v=>(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const id=()=>crypto.randomUUID();

const initial={
 salario:3062,
 contas:[
  {id:id(),nome:'Aluguel',valor:500,dia:5,status:'Pendente'},
  {id:id(),nome:'Luz',valor:110,dia:10,status:'Pendente'},
  {id:id(),nome:'Internet',valor:60,dia:12,status:'Pendente'},
  {id:id(),nome:'Celular',valor:55,dia:15,status:'Pendente'},
  {id:id(),nome:'Transporte',valor:312,dia:5,status:'Pendente'},
  {id:id(),nome:'Alimentação',valor:500,dia:5,status:'Pendente'},
  {id:id(),nome:'Assinaturas',valor:55,dia:5,status:'Pendente'},
  {id:id(),nome:'Caixa Mor',valor:200,dia:5,status:'Pendente'}
 ],
 gastos:[],
 parcelas:[
  {id:id(),nome:'Fone',valor:135,restam:3},
  {id:id(),nome:'Nubank',valor:135.52,restam:5},
  {id:id(),nome:'Crefaz',valor:355,restam:null}
 ],
 metas:[
  {id:id(),nome:'Reserva de emergência',atual:0,objetivo:7500},
  {id:id(),nome:'Faculdade 2027',atual:0,objetivo:10000}
 ]
};

let state=JSON.parse(localStorage.getItem(KEY)||'null')||initial;
let chartCat,chartDist;

const save=()=>{localStorage.setItem(KEY,JSON.stringify(state));render()};

function totals(){
 const fixos=state.contas.reduce((a,b)=>a+Number(b.valor||0),0);
 const gastos=state.gastos.reduce((a,b)=>a+Number(b.valor||0),0);
 const dividas=state.parcelas.reduce((a,b)=>a+Number(b.valor||0),0);
 const sobra=Number(state.salario||0)-fixos-gastos-dividas;
 const reserva=state.metas.find(m=>m.nome.toLowerCase().includes('reserva'))?.atual||0;
 const economia=state.salario?Math.max(0,Math.round((sobra/state.salario)*100)):0;
 return {fixos,gastos,dividas,sobra,reserva,economia};
}

document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>go(b.dataset.page));
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
openMenu.onclick=()=>sidebar.classList.toggle('open');
function go(page){
 document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
 document.querySelectorAll('.nav').forEach(n=>n.classList.remove('active'));
 document.getElementById(page).classList.add('active');
 document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
 pageTitle.textContent=document.querySelector(`[data-page="${page}"]`)?.textContent.replace(/[^\wÀ-ÿ ]/g,'').trim()||'Dashboard';
 sidebar.classList.remove('open');
}

addConta.onclick=()=>{
 if(!contaNome.value||!contaValor.value)return alert('Preencha nome e valor.');
 state.contas.push({id:id(),nome:contaNome.value,valor:+contaValor.value,dia:+contaDia.value||5,status:contaStatus.value});
 contaNome.value=contaValor.value=contaDia.value='';save();
};
addGasto.onclick=()=>{
 if(!gastoDesc.value||!gastoValor.value)return alert('Preencha descrição e valor.');
 state.gastos.unshift({id:id(),desc:gastoDesc.value,valor:+gastoValor.value,cat:gastoCat.value,data:new Date().toISOString()});
 gastoDesc.value=gastoValor.value='';save();
};
addParcela.onclick=()=>{
 if(!parcelaNome.value||!parcelaValor.value)return alert('Preencha nome e valor.');
 state.parcelas.push({id:id(),nome:parcelaNome.value,valor:+parcelaValor.value,restam:parcelaRestam.value?+parcelaRestam.value:null});
 parcelaNome.value=parcelaValor.value=parcelaRestam.value='';save();
};
addMeta.onclick=()=>{
 if(!metaNome.value||!metaObjetivo.value)return alert('Preencha nome e objetivo.');
 state.metas.push({id:id(),nome:metaNome.value,atual:+metaAtual.value||0,objetivo:+metaObjetivo.value});
 metaNome.value=metaAtual.value=metaObjetivo.value='';save();
};
saveSalario.onclick=()=>{state.salario=+salarioInput.value||0;save()};

function del(type,itemId){state[type]=state[type].filter(x=>x.id!==itemId);save()}
function statusConta(itemId,val){let c=state.contas.find(x=>x.id===itemId);if(c)c.status=val;save()}
function pagarParcela(itemId){let p=state.parcelas.find(x=>x.id===itemId);if(p&&p.restam!==null&&p.restam>0)p.restam--;save()}
function updateGoal(itemId){let m=state.metas.find(x=>x.id===itemId);let inp=document.getElementById('goal-'+itemId);if(m){m.atual=+inp.value||0;save()}}

exportar.onclick=()=>{
 const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='backup-financas-maycon.json';a.click();
};
importar.onchange=async e=>{
 const f=e.target.files[0]; if(!f)return;
 try{state=JSON.parse(await f.text());save();alert('Backup importado!')}catch{alert('Arquivo inválido')}
};
resetar.onclick=()=>{if(confirm('Apagar tudo e voltar ao padrão?')){localStorage.removeItem(KEY);state=structuredClone(initial);save()}};

function renderContas(){
 const html=state.contas.map(c=>`<div class="row"><div><strong>${c.nome}</strong><small>${money(c.valor)} • vence dia ${c.dia}</small></div><select class="status ${c.status}" onchange="statusConta('${c.id}',this.value)">${['Pago','Pendente','Atrasado'].map(s=>`<option ${c.status===s?'selected':''}>${s}</option>`).join('')}</select><button class="icon" onclick="del('contas','${c.id}')">Excluir</button></div>`).join('');
 listaContas.innerHTML=html||'<p class="muted">Nenhuma conta.</p>';
 dashContas.innerHTML=state.contas.slice().sort((a,b)=>a.dia-b.dia).slice(0,6).map(c=>`<div class="row"><div><strong>${c.nome}</strong><small>${money(c.valor)} • dia ${c.dia}</small></div><span class="status ${c.status}">${c.status}</span><span></span></div>`).join('');
 const pagas=state.contas.filter(c=>c.status==='Pago').length;
 contasPagasResumo.textContent=`${pagas}/${state.contas.length} pagas`;
}
function renderGastos(){
 totalGastos.textContent=money(state.gastos.reduce((a,b)=>a+Number(b.valor||0),0));
 listaGastos.innerHTML=state.gastos.map(g=>`<div class="row"><div><strong>${g.desc}</strong><small>${g.cat} • ${new Date(g.data).toLocaleDateString('pt-BR')}</small></div><strong>${money(g.valor)}</strong><button class="icon" onclick="del('gastos','${g.id}')">Excluir</button></div>`).join('')||'<p class="muted">Nenhum gasto lançado.</p>';
}
function renderParcelas(){
 const total=state.parcelas.reduce((a,b)=>a+Number(b.valor||0),0);
 totalParcelas.textContent=money(total);
 listaParcelas.innerHTML=state.parcelas.map(p=>`<div class="row"><div><strong>${p.nome}</strong><small>${money(p.valor)} por mês • ${p.restam===null?'restante não informado':p.restam+' parcelas restantes'}</small></div><button class="icon" onclick="pagarParcela('${p.id}')">Baixar 1</button><button class="icon" onclick="del('parcelas','${p.id}')">Excluir</button></div>`).join('')||'<p class="muted">Nenhuma parcela.</p>';
}
function goalCard(m){
 const pct=m.objetivo?Math.min(100,Math.round((m.atual/m.objetivo)*100)):0;
 return `<div class="goal"><div class="goal-top"><strong>${m.nome}</strong><span>${pct}%</span></div><div class="bar"><div style="width:${pct}%"></div></div><div class="goal-foot"><span>${money(m.atual)}</span><span>${money(m.objetivo)}</span></div><div class="goal-edit"><input id="goal-${m.id}" type="number" step="0.01" placeholder="Novo valor atual"><button class="btn glass" onclick="updateGoal('${m.id}')">Atualizar</button><button class="btn danger" onclick="del('metas','${m.id}')">Excluir</button></div></div>`;
}
function renderMetas(){
 listaMetas.innerHTML=state.metas.map(goalCard).join('');
 dashMetas.innerHTML=state.metas.slice(0,3).map(goalCard).join('');
}
function renderAlerts(t){
 let alerts=[];
 state.contas.filter(c=>c.status==='Atrasado').forEach(c=>alerts.push(`<div class="alert red"><strong>${c.nome}</strong><br><span>Conta marcada como atrasada.</span></div>`));
 state.contas.filter(c=>c.status==='Pendente'&&c.dia<=10).slice(0,3).forEach(c=>alerts.push(`<div class="alert yellow"><strong>${c.nome}</strong><br><span>Vence no início do mês.</span></div>`));
 if(t.sobra<0)alerts.push(`<div class="alert red"><strong>Atenção</strong><br><span>Seu mês está negativo em ${money(Math.abs(t.sobra))}.</span></div>`);
 if(!alerts.length)alerts.push(`<div class="alert"><strong>Tudo certo</strong><br><span>Nenhum alerta crítico agora.</span></div>`);
 alertas.innerHTML=alerts.join('');
}
function renderCharts(t){
 const cats={}; state.gastos.forEach(g=>cats[g.cat]=(cats[g.cat]||0)+Number(g.valor||0));
 if(chartCat)chartCat.destroy();
 chartCat=new Chart(chartCategorias,{type:'doughnut',data:{labels:Object.keys(cats).length?Object.keys(cats):['Sem gastos'],datasets:[{data:Object.values(cats).length?Object.values(cats):[1],backgroundColor:['#820AD1','#a855f7','#c084fc','#22c55e','#facc15','#ef4444','#6d28d9'],borderWidth:0}]},options:{plugins:{legend:{labels:{color:'#fff',font:{weight:'bold'}}}}}});
 if(chartDist)chartDist.destroy();
 chartDist=new Chart(chartDistribuicao,{type:'bar',data:{labels:['Fixos','Extras','Dívidas','Sobra'],datasets:[{data:[t.fixos,t.gastos,t.dividas,Math.max(0,t.sobra)],backgroundColor:['#820AD1','#a855f7','#c084fc','#22c55e'],borderRadius:12}]},options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#fff'},grid:{display:false}},y:{ticks:{color:'#fff'},grid:{color:'rgba(255,255,255,.08)'}}}}});
}
function render(){
 const t=totals();
 sidebarSobra.textContent=money(t.sobra); sidebarStatus.textContent=t.sobra>=0?'Dentro do plano':'Mês negativo';
 saldoHero.textContent=money(t.sobra); economiaPct.textContent=t.economia+'%'; ring.style.setProperty('--pct',t.economia+'%');
 fraseHero.textContent=t.sobra>=0?'Boa, você ainda tem saldo previsto no mês.':'Atenção: seus gastos passaram do salário.';
 kpiSalario.textContent=money(state.salario); kpiFixos.textContent=money(t.fixos); kpiExtras.textContent=money(t.gastos); kpiDividas.textContent=money(t.dividas); kpiReserva.textContent=money(t.reserva);
 salarioInput.value=state.salario;
 renderContas();renderGastos();renderParcelas();renderMetas();renderAlerts(t);renderCharts(t);
}
render();
