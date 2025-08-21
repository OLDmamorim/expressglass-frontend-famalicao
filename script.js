// =============== CONFIG/API ===============
const API_BASE = 'https://expressglass-backend-famalicao.netlify.app';

async function apiGet(path) {
  const r = await fetch(API_BASE + path, {
    headers: { 'X-Tenant-Id': 'famalicao' }
  });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}

// =============== UTIL ===============
function toISO(d) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function parseISO(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  return isNaN(d) ? '' : toISO(d);
}
function fmtPT(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-PT');
}
function daysDiff(fromISO) {
  const today = new Date(); today.setHours(0,0,0,0);
  const dt = new Date(fromISO); dt.setHours(0,0,0,0);
  const diff = Math.round((dt - today) / 86400000);
  if (diff < 0) return `${Math.abs(diff)} dias atrás`;
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  return `${diff} dias`;
}

// =============== ESTADO ===============
let appointments = [];

// =============== RENDER ===============
// Preenche a tabela “SERVIÇOS A REALIZAR” (tbody id="servicesTableBody")
function renderServicesTable() {
  const tbody = document.getElementById('servicesTableBody');
  if (!tbody) return;

  const future = [...appointments]
    .filter(a => a.date) // só com data
    .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));

  tbody.innerHTML = future.map(a => {
    const dateISO = parseISO(a.date);
    const period  = a.period ?? a.periodo ?? '';
    const plate   = a.plate  ?? a.matricula ?? '';
    const car     = (a.car  ?? a.carro ?? '').toString();
    const service = a.service ?? a.servico ?? '';
    const notes   = a.notes ?? a.obs ?? '';
    const status  = a.status ?? a.estado ?? '';

    return `
      <tr>
        <td>${fmtPT(dateISO)}</td>
        <td>${period}</td>
        <td>${plate}</td>
        <td>${car}</td>
        <td><span class="badge badge-${service}">${service}</span></td>
        <td>${notes}</td>
        <td><span class="chip chip-${status}">${status}</span></td>
        <td>${dateISO ? daysDiff(dateISO) : ''}</td>
        <td class="no-print">
          <div class="actions">
            <button class="icon edit" title="Editar" disabled>✏️</button>
            <button class="icon delete" title="Eliminar" disabled>🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function clearConnectingBar() {
  const bar = document.querySelector('#apiBar, .api-bar, .connecting, .status-bar');
  if (bar) bar.textContent = 'Online';
}

// =============== LOAD + BOOT ===============
async function loadAndRender() {
  try {
    clearConnectingBar();

    // Buscar todos os agendamentos do tenant
    appointments = await apiGet('/api/appointments');

    // Normalização mínima
    appointments.forEach(a => {
      if (!a.id) a.id = Date.now() + Math.random();
      // aceitar backends que ainda usam "data" em vez de "date"
      a.date = a.date ? parseISO(a.date) : parseISO(a.data);
    });

    renderServicesTable();
  } catch (e) {
    console.error(e);
    const tbody = document.getElementById('servicesTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr><td colspan="9" style="color:#b91c1c">
          Erro a carregar dados: ${e.message}
        </td></tr>`;
    }
  }
}

document.addEventListener('DOMContentLoaded', loadAndRender);
