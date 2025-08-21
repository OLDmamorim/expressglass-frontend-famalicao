// =============== CONFIG/API ===============
const API_BASE = 'https://expressglass-backend-famalicao.netlify.app';

async function apiGet(path) {
  const r = await fetch(API_BASE + path, {
    headers: { 'X-Tenant-Id': 'famalicao' }
  });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}
async function apiPost(path, data) {
  const r = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'famalicao' },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function apiPut(path, data) {
  const r = await fetch(API_BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'famalicao' },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(`PUT ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function apiDelete(path) {
  const r = await fetch(API_BASE + path, {
    method: 'DELETE',
    headers: { 'X-Tenant-Id': 'famalicao' }
  });
  if (!r.ok && r.status !== 204) throw new Error(`DELETE ${path} -> ${r.status}`);
  return true;
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
function showToast(msg, type='info') {
  const c = document.getElementById('toastContainer');
  if (!c) { console[type==='error'?'error':'log'](msg); return; }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icon = type==='success'?'✅':type==='error'?'❌':'ℹ️';
  t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(()=>t.remove(), 3500);
}
function formatPlate(el){
  let v = el.value.replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  if (v.length>2) v = v.slice(0,2) + '-' + v.slice(2);
  if (v.length>5) v = v.slice(0,5) + '-' + v.slice(5,7);
  el.value = v;
}

// =============== ESTADO ===============
let appointments = [];
let editingId = null;

// =============== RENDER ===============
function renderServicesTable() {
  const tbody = document.getElementById('servicesTableBody');
  if (!tbody) return;

  const future = [...appointments]
    .filter(a => a.date) // com data
    .sort((a,b)=> a.date.localeCompare(b.date));

  tbody.innerHTML = future.map(a => {
    const dateISO = parseISO(a.date);
    const period  = a.period  ?? a.periodo ?? '';
    const plate   = a.plate   ?? a.matricula ?? '';
    const car     = (a.car    ?? a.carro ?? '').toString();
    const service = a.service ?? a.servico ?? '';
    const notes   = a.notes   ?? a.obs ?? '';
    const status  = a.status  ?? a.estado ?? '';

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
            <button class="icon edit" title="Editar" onclick="editAppointment(${a.id})">✏️</button>
            <button class="icon delete" title="Eliminar" onclick="deleteAppointment(${a.id})">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// =============== MODAL ===============
function openAppointmentModal(id=null) {
  editingId = id;
  const modal = document.getElementById('appointmentModal');
  if (!modal) return;

  const title   = document.getElementById('modalTitle');
  const delBtn  = document.getElementById('deleteAppointment');
  const form    = document.getElementById('appointmentForm');

  if (id) {
    const a = appointments.find(x => x.id === id);
    if (!a) return;
    title.textContent = 'Editar Agendamento';
    document.getElementById('appointmentDate').value   = fmtPT(parseISO(a.date));
    document.getElementById('appointmentPeriod').value = a.period ?? a.periodo ?? '';
    document.getElementById('appointmentPlate').value  = a.plate ?? a.matricula ?? '';
    document.getElementById('appointmentCar').value    = a.car ?? a.carro ?? '';
    document.getElementById('appointmentService').value= a.service ?? a.servico ?? '';
    document.getElementById('appointmentStatus').value = a.status ?? a.estado ?? 'NE';
    document.getElementById('appointmentNotes').value  = a.notes ?? a.obs ?? '';
    document.getElementById('appointmentExtra').value  = a.extra ?? '';
    delBtn?.classList.remove('hidden');
  } else {
    title.textContent = 'Novo Agendamento';
    form?.reset();
    document.getElementById('appointmentStatus').value = 'NE';
    delBtn?.classList.add('hidden');
  }

  modal.classList.add('show');
}
function closeAppointmentModal(){
  document.getElementById('appointmentModal')?.classList.remove('show');
  editingId = null;
}

// =============== CRUD ===============
async function saveAppointment(evt){
  evt?.preventDefault();

  const rawDate = document.getElementById('appointmentDate').value; // DD/MM/YYYY ou YYYY-MM-DD
  // aceitar DD/MM/YYYY e converter para ISO
  let dateISO = rawDate;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawDate)) {
    const [d,m,y] = rawDate.split('/');
    dateISO = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    dateISO = rawDate;
  }

  const payload = {
    date:   parseISO(dateISO),
    period: document.getElementById('appointmentPeriod').value,
    plate:  document.getElementById('appointmentPlate').value.toUpperCase(),
    car:    document.getElementById('appointmentCar').value,
    service:document.getElementById('appointmentService').value,
    status: document.getElementById('appointmentStatus').value,
    notes:  document.getElementById('appointmentNotes').value,
    extra:  document.getElementById('appointmentExtra').value
  };

  // obrigatórios mínimos
  if (!payload.plate || !payload.car || !payload.service) {
    showToast('Preencha Matrícula, Carro e Serviço.', 'error');
    return;
  }

  try {
    if (editingId) {
      const updated = await apiPut(`/api/appointments/${editingId}`, payload);
      // atualizar no array local
      const i = appointments.findIndex(a => a.id === editingId);
      if (i >= 0) appointments[i] = { ...appointments[i], ...updated };
      showToast('Agendamento atualizado!', 'success');
    } else {
      const created = await apiPost('/api/appointments', payload);
      appointments.push(created);
      showToast('Agendamento criado!', 'success');
    }
    closeAppointmentModal();
    renderServicesTable();
  } catch (e) {
    console.error(e);
    showToast('Erro ao guardar: ' + e.message, 'error');
  }
}

async function deleteAppointment(id){
  if (!confirm('Eliminar este agendamento?')) return;
  try {
    await apiDelete(`/api/appointments/${id}`);
    appointments = appointments.filter(a => a.id !== id);
    renderServicesTable();
    showToast('Agendamento eliminado!', 'success');
    if (editingId === id) closeAppointmentModal();
  } catch (e) {
    console.error(e);
    showToast('Erro ao eliminar: ' + e.message, 'error');
  }
}
function editAppointment(id){ openAppointmentModal(id); }

// =============== CARREGAR & INICIAR ===============
async function loadAndRender() {
  try {
    appointments = await apiGet('/api/appointments');
    appointments.forEach(a => {
      if (!a.id) a.id = Date.now() + Math.random();
      a.date = a.date ? parseISO(a.date) : parseISO(a.data);
    });
    renderServicesTable();
  } catch (e) {
    console.error(e);
    const tbody = document.getElementById('servicesTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" style="color:#b91c1c">
        Erro a carregar dados: ${e.message}
      </td></tr>`;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadAndRender();

  // Botões/handlers do modal
  document.getElementById('addServiceBtn')?.addEventListener('click', () => openAppointmentModal());
  document.getElementById('closeModal')?.addEventListener('click', closeAppointmentModal);
  document.getElementById('cancelForm')?.addEventListener('click', closeAppointmentModal);
  document.getElementById('deleteAppointment')?.addEventListener('click', () => { if (editingId) deleteAppointment(editingId); });
  document.getElementById('appointmentForm')?.addEventListener('submit', saveAppointment);
  document.getElementById('appointmentPlate')?.addEventListener('input', e => formatPlate(e.target));

  // Fechar modal clicando fora
  document.addEventListener('click', (e) => {
    if (e.target.classList?.contains('modal')) e.target.classList.remove('show');
  });

  // Atalhos
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAppointmentModal();
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openAppointmentModal(); }
  });
});

// expor globais para os botões na tabela
window.editAppointment   = editAppointment;
window.deleteAppointment = deleteAppointment;
