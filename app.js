const STORAGE_KEY = "maycon_financas_dashboard_v1";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const defaultState = {
  salario: 3062,
  contas: [
    { id: crypto.randomUUID(), nome: "Aluguel", valor: 500, vencimento: 5, status: "Pendente" },
    { id: crypto.randomUUID(), nome: "Luz", valor: 110, vencimento: 10, status: "Pendente" },
    { id: crypto.randomUUID(), nome: "Internet", valor: 60, vencimento: 12, status: "Pendente" },
    { id: crypto.randomUUID(), nome: "Celular", valor: 55, vencimento: 15, status: "Pendente" },
    { id: crypto.randomUUID(), nome: "Transporte", valor: 312, vencimento: 5, status: "Pendente" },
    { id: crypto.randomUUID(), nome: "Alimentação", valor: 500, vencimento: 5, status: "Pendente" },
    { id: crypto.randomUUID(), nome: "Assinaturas", valor: 55, vencimento: 5, status: "Pendente" },
    { id: crypto.randomUUID(), nome: "Fone", valor: 135, vencimento: 5, status: "Pendente" },
    { id: crypto.randomUUID(), nome: "Caixa Mor", valor: 200, vencimento: 5, status: "Pendente" },
    { id: crypto.randomUUID(), nome: "Nubank", valor: 135.52, vencimento: 5, status: "Pendente" },
    { id: crypto.randomUUID(), nome: "Crefaz", valor: 355, vencimento: 5, status: "Atrasado" }
  ],
  gastos: [],
  metas: [
    { id: crypto.randomUUID(), nome: "Reserva de emergência", atual: 0, objetivo: 7500 },
    { id: crypto.randomUUID(), nome: "Faculdade 2027", atual: 0, objetivo: 10000 }
  ]
};

let state = loadState();
let categoriaChart;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function money(value) {
  return BRL.format(Number(value) || 0);
}

function calc() {
  const totalContas = state.contas.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const totalGastos = state.gastos.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const reserva = state.metas.find(m => m.nome.toLowerCase().includes("reserva"))?.atual || 0;
  const sobra = Number(state.salario || 0) - totalContas - totalGastos;
  const economia = state.salario > 0 ? Math.max(0, Math.round((sobra / state.salario) * 100)) : 0;
  return { totalContas, totalGastos, reserva, sobra, economia };
}

function setPage(pageId) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  document.querySelectorAll(".menu-item").forEach(btn => btn.classList.remove("active"));
  document.getElementById(pageId).classList.add("active");
  document.querySelector(`[data-page="${pageId}"]`)?.classList.add("active");
  document.getElementById("pageTitle").textContent = document.querySelector(`[data-page="${pageId}"]`)?.textContent.replace(/[^\wÀ-ÿ ]/g, "").trim() || "Dashboard";
}

document.querySelectorAll("[data-page]").forEach(btn => {
  btn.addEventListener("click", () => setPage(btn.dataset.page));
});
document.querySelectorAll("[data-page-link]").forEach(btn => {
  btn.addEventListener("click", () => setPage(btn.dataset.pageLink));
});

document.getElementById("btnPrint").addEventListener("click", () => window.print());

document.getElementById("addConta").addEventListener("click", () => {
  const nome = document.getElementById("contaNome").value.trim();
  const valor = Number(document.getElementById("contaValor").value);
  const vencimento = Number(document.getElementById("contaVencimento").value || 5);
  const status = document.getElementById("contaStatus").value;

  if (!nome || !valor) return alert("Preencha nome e valor da conta.");

  state.contas.push({ id: crypto.randomUUID(), nome, valor, vencimento, status });
  document.getElementById("contaNome").value = "";
  document.getElementById("contaValor").value = "";
  document.getElementById("contaVencimento").value = "";
  saveState();
});

document.getElementById("addGasto").addEventListener("click", () => {
  const descricao = document.getElementById("gastoDescricao").value.trim();
  const valor = Number(document.getElementById("gastoValor").value);
  const categoria = document.getElementById("gastoCategoria").value;

  if (!descricao || !valor) return alert("Preencha descrição e valor do gasto.");

  state.gastos.unshift({
    id: crypto.randomUUID(),
    descricao,
    valor,
    categoria,
    data: new Date().toISOString()
  });

  document.getElementById("gastoDescricao").value = "";
  document.getElementById("gastoValor").value = "";
  saveState();
});

document.getElementById("addMeta").addEventListener("click", () => {
  const nome = document.getElementById("metaNome").value.trim();
  const atual = Number(document.getElementById("metaAtual").value || 0);
  const objetivo = Number(document.getElementById("metaObjetivo").value);

  if (!nome || !objetivo) return alert("Preencha nome e objetivo da meta.");

  state.metas.push({ id: crypto.randomUUID(), nome, atual, objetivo });
  document.getElementById("metaNome").value = "";
  document.getElementById("metaAtual").value = "";
  document.getElementById("metaObjetivo").value = "";
  saveState();
});

document.getElementById("saveSalario").addEventListener("click", () => {
  state.salario = Number(document.getElementById("salarioInput").value || 0);
  saveState();
});

document.getElementById("exportBackup").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup-financas-maycon-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("importBackup").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.contas || !data.gastos || !data.metas) throw new Error("Backup inválido");
    state = data;
    saveState();
    alert("Backup importado com sucesso.");
  } catch {
    alert("Não consegui importar. O arquivo parece inválido.");
  }
});

document.getElementById("resetData").addEventListener("click", () => {
  if (!confirm("Tem certeza que deseja apagar todos os dados?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(defaultState);
  render();
});

function changeContaStatus(id, status) {
  const conta = state.contas.find(item => item.id === id);
  if (conta) conta.status = status;
  saveState();
}

function removeConta(id) {
  state.contas = state.contas.filter(item => item.id !== id);
  saveState();
}

function removeGasto(id) {
  state.gastos = state.gastos.filter(item => item.id !== id);
  saveState();
}

function updateMeta(id) {
  const input = document.getElementById(`meta-${id}`);
  const meta = state.metas.find(item => item.id === id);
  if (!meta) return;
  meta.atual = Number(input.value || 0);
  saveState();
}

function removeMeta(id) {
  state.metas = state.metas.filter(item => item.id !== id);
  saveState();
}

function renderContas() {
  const list = document.getElementById("listaContas");
  const dash = document.getElementById("dashboardContas");

  const html = state.contas.map(conta => `
    <div class="row">
      <div>
        <strong>${conta.nome}</strong>
        <small>${money(conta.valor)} • vence dia ${conta.vencimento}</small>
      </div>
      <select class="status ${conta.status}" onchange="changeContaStatus('${conta.id}', this.value)">
        ${["Pago", "Pendente", "Atrasado"].map(s => `<option value="${s}" ${conta.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
      <div class="row-actions">
        <button class="icon-btn" onclick="removeConta('${conta.id}')">Excluir</button>
      </div>
    </div>
  `).join("");

  list.innerHTML = html || `<p class="muted">Nenhuma conta cadastrada.</p>`;

  dash.innerHTML = state.contas.slice(0, 7).map(conta => `
    <div class="row">
      <div>
        <strong>${conta.nome}</strong>
        <small>${money(conta.valor)} • dia ${conta.vencimento}</small>
      </div>
      <span class="status ${conta.status}">${conta.status}</span>
      <span></span>
    </div>
  `).join("");

  const pagas = state.contas.filter(c => c.status === "Pago").length;
  document.getElementById("resumoContas").textContent = `${pagas}/${state.contas.length} pagas`;
}

function renderGastos() {
  const list = document.getElementById("listaGastos");
  const total = state.gastos.reduce((acc, g) => acc + Number(g.valor || 0), 0);

  document.getElementById("totalGastosRecentes").textContent = money(total);

  list.innerHTML = state.gastos.map(gasto => `
    <div class="row">
      <div>
        <strong>${gasto.descricao}</strong>
        <small>${gasto.categoria} • ${new Date(gasto.data).toLocaleDateString("pt-BR")}</small>
      </div>
      <strong>${money(gasto.valor)}</strong>
      <div class="row-actions">
        <button class="icon-btn" onclick="removeGasto('${gasto.id}')">Excluir</button>
      </div>
    </div>
  `).join("") || `<p class="muted">Nenhum gasto lançado ainda.</p>`;
}

function goalHTML(meta) {
  const pct = meta.objetivo > 0 ? Math.min(100, Math.round((meta.atual / meta.objetivo) * 100)) : 0;

  return `
    <div class="goal">
      <div class="goal-top">
        <strong>${meta.nome}</strong>
        <span>${pct}%</span>
      </div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="goal-footer">
        <span>${money(meta.atual)} guardado</span>
        <span>meta ${money(meta.objetivo)}</span>
      </div>
      <div class="goal-edit">
        <input id="meta-${meta.id}" type="number" step="0.01" placeholder="Novo valor atual" />
        <button class="btn ghost" onclick="updateMeta('${meta.id}')">Atualizar</button>
        <button class="btn danger" onclick="removeMeta('${meta.id}')">Excluir</button>
      </div>
    </div>
  `;
}

function renderMetas() {
  const html = state.metas.map(goalHTML).join("") || `<p class="muted">Nenhuma meta cadastrada.</p>`;
  document.getElementById("listaMetas").innerHTML = html;
  document.getElementById("dashboardMetas").innerHTML = state.metas.slice(0, 3).map(goalHTML).join("");
}

function renderChart() {
  const totals = {};
  state.gastos.forEach(g => {
    totals[g.categoria] = (totals[g.categoria] || 0) + Number(g.valor || 0);
  });

  const labels = Object.keys(totals);
  const values = Object.values(totals);

  if (categoriaChart) categoriaChart.destroy();

  categoriaChart = new Chart(document.getElementById("categoriaChart"), {
    type: "doughnut",
    data: {
      labels: labels.length ? labels : ["Sem gastos"],
      datasets: [{
        data: values.length ? values : [1],
        borderWidth: 0,
        backgroundColor: ["#820AD1", "#A855F7", "#C084FC", "#6D28D9", "#22C55E", "#FACC15", "#EF4444"]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: "#F8F2FF", font: { weight: "bold" } }
        }
      }
    }
  });
}

function render() {
  const c = calc();

  document.getElementById("sideSobra").textContent = money(c.sobra);
  document.getElementById("heroSaldo").textContent = money(c.sobra);
  document.getElementById("heroEconomia").textContent = `${c.economia}%`;
  document.querySelector(".hero-progress").style.setProperty("--pct", `${c.economia}%`);

  document.getElementById("kpiSalario").textContent = money(state.salario);
  document.getElementById("kpiContas").textContent = money(c.totalContas);
  document.getElementById("kpiGastos").textContent = money(c.totalGastos);
  document.getElementById("kpiReserva").textContent = money(c.reserva);

  document.getElementById("salarioInput").value = state.salario;

  renderContas();
  renderGastos();
  renderMetas();
  renderChart();
}

render();
