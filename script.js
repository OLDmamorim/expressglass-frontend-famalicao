// ======================
// UTILIDADES DE DATA
// ======================
function localISO(date) {
  const off = date.getTimezoneOffset();
  const d = new Date(date.getTime() - off * 60 * 1000);
  return d.toISOString().split("T")[0];
}

// Converte datas em string para formato ISO (YYYY-MM-DD)
function parseDate(dateStr) {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr; // já está em ISO
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) { // DD/MM/YYYY
    const [d, m, y] = dateStr.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(dateStr);
  return isNaN(dt) ? "" : localISO(dt);
}

// Converte ISO para DD/MM/YYYY
function formatDateForInput(dateStr) {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}

// ======================
// API
// ======================
async function apiGet(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Erro GET " + r.status);
  return await r.json();
}

async function apiPost(url, data) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error("Erro POST " + r.status);
  return await r.json();
}

// ======================
// VARS GLOBAIS
// ======================
let appointments = [];

// ======================
// TOAST
// ======================
function showToast(msg, type = "info") {
  console.log(`[${type}] ${msg}`);
  // Aqui podes trocar para toast UI real
}

// ======================
// CARREGAR / GUARDAR
// ======================
async function load() {
  try {
    showToast("A carregar…", "info");
    appointments = await apiGet("/api/appointments");

    // Normalização mínima
    appointments.forEach((a) => {
      if (!a.id) a.id = Date.now() + Math.random();
      if (!a.sortIndex) a.sortIndex = 1;
    });

    showToast("Dados carregados da API!", "success");
    renderAppointments();
  } catch (e) {
    appointments = [];
    showToast("Erro ao carregar: " + e.message, "error");
  }
}

async function save() {
  /* o backend já guarda; compatibilidade */
  return;
}

// ======================
// RENDER
// ======================
function renderAppointments() {
  const tbody = document.querySelector("#appointments-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  appointments.forEach((a) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateForInput(parseDate(a.date))}</td>
      <td>${a.periodo || ""}</td>
      <td>${a.matricula || ""}</td>
      <td>${a.carro || ""}</td>
      <td>${a.servico || ""}</td>
      <td>${a.obs || ""}</td>
      <td>${a.estado || ""}</td>
      <td>-</td>
      <td>
        <button onclick="deleteAppointment('${a.id}')">❌</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ======================
// AÇÕES
// ======================
function deleteAppointment(id) {
  appointments = appointments.filter((a) => a.id != id);
  renderAppointments();
}

// ======================
// START
// ======================
window.addEventListener("DOMContentLoaded", load);
