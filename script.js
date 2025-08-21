// =============== CONFIG/API ===============
const API_BASE = 'https://expressglass-backend-famalicao.netlify.app';

async function apiGet(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const r = await fetch(url, { headers: { 'X-Tenant-Id': 'famalicao' } });
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
function cap(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function getMonday(date) {
  const d = new Date(date); const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}
function addDays(date, days){ const d = new Date(date); d.setDate(d.getDate()+days); return d; }
function localISO(date){ return toISO(date); }
function normalizePeriod(p){
  if (!p) return 'Manhã';
  const t = String(p).normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().toLowerCase();
  if (t==='manha') return 'Manhã';
  if (t==='tarde') return 'Tarde';
  return 'Manhã';
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
let currentMonday = getMonday(new Date());
let currentMobileDay = new Date();
let searchQuery = '';
let statusFilter = '';

// =============== FILTROS/PESQUISA ===============
function filterAppointments(list) {
  let r = [...list];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    r = r.filter(a =>
      (a.plate ?? a.matricula ?? '').toLowerCase().includes(q) ||
      (a.car ?? a.carro ?? '').toString().toLowerCase().includes(q) ||
      (a.notes ?? a.obs ?? '').toLowerCase().includes(q)
    );
  }
  if (statusFilter) r = r.filter(a => (a.status ?? a.estado) === statusFilter);
  return r;
}
function highlightSearchResults() {
  if (!searchQuery) return;
  document.querySelectorAll('.appointment').forEach(el => {
    el.classList.remove('highlight');
    const txt = el.textContent.toLowerCase();
    if (txt.includes(searchQuery.toLowerCase())) el.classList.add('highlight');
  });
}

// =============== RENDER: CALENDÁRIO ===============
function fmtHeader(d){
  return {
    day: d.toLocaleDateString('pt-PT',{weekday:'long'}),
    dm:  d.toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit'})
  };
}
function renderSchedule() {
  const table = document.getElementById('schedule'); if (!table) return;
  table.innerHTML = '';

  const week = [...Array(5)].map((_,i)=> addDays(currentMonday, i));
  const wr = document.getElementById('weekRange');
  if (wr) wr.textContent = `${week[0].toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit'})} - ${week[4].toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric'})}`;

  let thead = '<thead><tr><th>Período</th>';
  for (const d of week) {
    const h = fmtHeader(d);
    thead += `<th><div class="day">${cap(h.day)}</div><div class="date">${h.dm}</div></th>`;
  }
  thead += '</tr></thead>';
  table.insertAdjacentHTML('beforeend', thead);

  const renderCell = (period, dayDate) => {
    const iso = localISO(dayDate);
    const items = filterAppointments(
      appointments
        .filter(a => a.date && a.date === iso && normalizePeriod(a.period ?? a.periodo) === period)
        .sort((x,y)=> (x.sortIndex||0)-(y.sortIndex||0))
    );
    const blocks = items.map(a => {
      const plate = a.plate ?? a.matricula ?? '';
      const car   = (a.car ?? a.carro ?? '').toString().toUpperCase();
      const srv   = a.service ?? a.servico ?? '';
      const st    = a.status ?? a.estado ?? '';
      return `<div class="appointment appointment-block" data-id="${a.id}" draggable="false"
                style="background-color: rgba(243,244,246,.9); border-left:6px solid ${st==='NE'?'#EF4444':st==='VE'?'#F59E0B':st==='ST'?'#10B981':'#94a3b8'}; margin-bottom:6px;">
                <div class="appt-header">${plate} | ${srv} | ${car}</div>
                <div class="appt-sub">${a.notes ?? a.obs ?? ''}</div>
              </div>`;
    }).join('');
    return `<div class="drop-zone" data-drop-bucket="${iso}|${period}">${blocks}</div>`;
  };

  const tbody = document.createElement('tbody');
  ['Manhã','Tarde'].forEach(period => {
    const row = document.createElement('tr');
    row.innerHTML = `<th>${period}</th>` + week.map(d => `<td>${renderCell(period,d)}</td>`).join('');
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  highlightSearchResults();
}

function renderUnscheduled() {
  const container = document.getElementById('unscheduledList'); if (!container) return;
  const uns = filterAppointments(
    appointments.filter(a => !a.date || !a.period).sort((x,y)=> (x.sortIndex||0)-(y.sortIndex||0))
  );
  const blocks = uns.map(a => {
    const plate = a.plate ?? a.matricula ?? '';
    const car   = (a.car ?? a.carro ?? '').toString().toUpperCase();
    const srv   = a.service ?? a.servico ?? '';
    const st    = a.status ?? a.estado ?? '';
    return `<div class="appointment unscheduled appointment-block" data-id="${a.id}"
              style="background-color: rgba(243,244,246,.9); border-left:6px solid ${st==='NE'?'#EF4444':st==='VE'?'#F59E0B':st==='ST'?'#10B981':'#94a3b8'}; margin-bottom:6px;">
              <div class="appt-header">${plate} | ${srv} | ${car}</div>
              <div class="appt-sub">${a.notes ?? a.obs ?? ''}</div>
              <div class="unscheduled-actions">
                <button class="icon edit" onclick="editAppointment(${a.id})" title="Editar">✏️</button>
                <button class="icon delete" onclick="deleteAppointment(${a.id})" title="Eliminar">🗑️</button>
              </div>
            </div>`;
  }).join('');
  container.innerHTML = blocks || '<div class="empty">Sem serviços por agendar.</div>';
  highlightSearchResults();
}

function renderMobileDay() {
  const label = document.getElementById('mobileDayLabel'); if (label) {
    const dayStr = currentMobileDay.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
    label.textContent = cap(dayStr);
  }
  const iso = localISO(currentMobileDay);
  const list = filterAppointments(
    appointments.filter(a => a.date === iso)
      .sort((a,b)=> {
        const pa = normalizePeriod(a.period ?? a.periodo);
        const pb = normalizePeriod(b.period ?? b.periodo);
        if (pa !== pb) return pa==='Manhã' ? -1 : 1;
        return (a.sortIndex||0)-(b.sortIndex||0);
      })
  );
  const container = document.getElementById('mobileDayList'); if (!container) return;
  container.innerHTML = list.map(a => {
    const plate = a.plate ?? a.matricula ?? '';
    const car   = (a.car ?? a.carro ?? '').toString().toUpperCase();
    const srv   = a.service ?? a.servico ?? '';
    const st    = a.status ?? a.estado ?? '';
    const period= normalizePeriod(a.period ?? a.periodo);
    return `<div class="appointment appointment-block" style="background-color: rgba(243,244,246,.9); border-left:6px solid ${st==='NE'?'#EF4444':st==='VE'?'#F59E0B':st==='ST'?'#10B981':'#94a3b8'}; margin-bottom:10px;">
      <div class="appt-header">${period} - ${plate} | ${srv} | ${car}</div>
      <div class="appt-sub">${a.notes ?? a.obs ?? ''}</div>
    </div>`;
  }).join('');
  highlightSearchResults();
}

// =============== RENDER: TABELA SERVIÇOS ===============
function renderServicesTable() {
  const tbody = document.getElementById('servicesTableBody'); if (!tbody) return;
  const future = filterAppointments(
    [...appointments].filter(a => a.date).sort((a,b)=> a.date.localeCompare(b.date))
  );
  tbody.innerHTML = future.map(a => {
    const dateISO = parseISO(a.date);
    const period  = normalizePeriod(a.period ?? a.periodo ?? '');
    const plate   = a.plate   ?? a.matricula ?? '';
    const car     = (a.car    ?? a.carro ?? '').toString();
    const service = a.service ?? a.servico ?? '';
    const notes   = a.notes   ?? a.obs ?? '';
    const status  = a.status  ?? a.estado ?? '';
    return `
      <tr>
        <td>${fmtPT(dateISO)}</td>
        <td>${period || ''}</td>
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
  const sum = document.getElementById('servicesSummary');
  if (sum) sum.textContent = `${future.length} serviços pendentes`;
}

function renderAll(){ renderSchedule(); renderUnscheduled(); renderMobileDay(); renderServicesTable(); }

// =============== MODAL ===============
function openAppointmentModal(id=null) {
  editingId = id;
  const modal = document.getElementById('appointmentModal'); if (!modal) return;
  const title = document.getElementById('modalTitle');
  const delBtn= document.getElementById('deleteAppointment');
  const form  = document.getElementById('appointmentForm');

  if (id) {
    const a = appointments.find(x => x.id === id);
    if (!a) return;
    title.textContent = 'Editar Agendamento';
    document.getElementById('appointmentDate').value   = parseISO(a.date);
    document.getElementById('appointmentPeriod').value = normalizePeriod(a.period ?? a.periodo ?? '');
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
  const rawDate = document.getElementById('appointmentDate').value; // YYYY-MM-DD
  const payload = {
    date:   parseISO(rawDate),
    period: normalizePeriod(document.getElementById('appointmentPeriod').value),
    plate:  document.getElementById('appointmentPlate').value.toUpperCase(),
    car:    document.getElementById('appointmentCar').value,
    service:document.getElementById('appointmentService').value,
    status: document.getElementById('appointmentStatus').value,
    notes:  document.getElementById('appointmentNotes').value,
    extra:  document.getElementById('appointmentExtra').value
  };
  if (!payload.plate || !payload.car || !payload.service) {
    showToast('Preencha Matrícula, Carro e Serviço.', 'error'); return;
  }
  try {
    if (editingId) {
      const updated = await apiPut(`/api/appointments/${editingId}`, payload);
      const i = appointments.findIndex(a => a.id === editingId);
      if (i >= 0) appointments[i] = { ...appointments[i], ...updated };
      showToast('Agendamento atualizado!', 'success');
    } else {
      const created = await apiPost('/api/appointments', payload);
      appointments.push(created);
      showToast('Agendamento criado!', 'success');
    }
    closeAppointmentModal();
    renderAll();
  } catch (e) {
    console.error(e); showToast('Erro ao guardar: ' + e.message, 'error');
  }
}

async function deleteAppointment(id){
  if (!confirm('Eliminar este agendamento?')) return;
  try {
    await apiDelete(`/api/appointments/${id}`);
    appointments = appointments.filter(a => a.id !== id);
    renderAll();
    showToast('Agendamento eliminado!', 'success');
    if (editingId === id) closeAppointmentModal();
  } catch (e) {
    console.error(e); showToast('Erro ao eliminar: ' + e.message, 'error');
  }
}
function editAppointment(id){ openAppointmentModal(id); }

// =============== BACKUP / EXPORT / IMPORT / ESTATÍSTICAS ===============
function exportToJson() {
  const data = { version:'1.0', exported:new Date().toISOString(), appointments };
  const blob = new Blob([JSON.stringify(data,null,2)], { type:'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href=url; a.download=`agendamentos_${new Date().toISOString().split('T')[0]}.json`; a.click();
  URL.revokeObjectURL(url); showToast('Backup JSON exportado!', 'success');
}
function exportToCsv() {
  const headers = ['Data','Período','Matrícula','Carro','Serviço','Estado','Observações'];
  const rows = appointments.map(a => [
    a.date || '', normalizePeriod(a.period ?? a.periodo ?? ''), a.plate ?? a.matricula ?? '',
    a.car ?? a.carro ?? '', a.service ?? a.servico ?? '', a.status ?? a.estado ?? '', a.notes ?? a.obs ?? ''
  ]);
  const csv = [headers,...rows].map(r => r.map(f => `"${String(f).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`agendamentos_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  URL.revokeObjectURL(url); showToast('CSV exportado!', 'success');
}
function importFromJson(file){
  const rd = new FileReader();
  rd.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.appointments && Array.isArray(data.appointments)) {
        if (confirm(`Importar ${data.appointments.length} agendamentos? Isto substitui os atuais.`)) {
          appointments = data.appointments.map(a => ({...a, date: parseISO(a.date)}));
          renderAll(); showToast('Dados importados!', 'success');
          closeBackupModal();
        }
      } else showToast('Ficheiro inválido.', 'error');
    } catch (err) { showToast('Erro a ler ficheiro: ' + err.message, 'error'); }
  };
  rd.readAsText(file);
}
function generateStats() {
  const total = appointments.length;
  const scheduled = appointments.filter(a => a.date && a.period).length;
  const byStatus = { NE:0, VE:0, ST:0 };
  appointments.forEach(a => { const s=(a.status ?? a.estado ?? ''); if (byStatus[s]!==undefined) byStatus[s]++; });
  const byService = {}; appointments.forEach(a => { const s=a.service ?? a.servico ?? ''; byService[s]=(byService[s]||0)+1; });
  return { total, scheduled, unscheduled: total - scheduled, byStatus, byService };
}
function showStats() {
  const s = generateStats();
  const c = document.getElementById('statsContent'); if (!c) return;
  c.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-number">${s.total}</div><div class="stat-label">Total</div></div>
      <div class="stat-card"><div class="stat-number">${s.scheduled}</div><div class="stat-label">Agendados</div></div>
      <div class="stat-card"><div class="stat-number">${s.unscheduled}</div><div class="stat-label">Por agendar</div></div>
    </div>
    <h4>Por Status</h4>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-number">${s.byStatus.NE}</div><div class="stat-label">N/E</div></div>
      <div class="stat-card"><div class="stat-number">${s.byStatus.VE}</div><div class="stat-label">V/E</div></div>
      <div class="stat-card"><div class="stat-number">${s.byStatus.ST}</div><div class="stat-label">ST</div></div>
    </div>
    <h4>Por Serviço</h4>
    <div class="stats-grid">
      ${Object.entries(s.byService).map(([srv,cnt])=>`
        <div class="stat-card"><div class="stat-number">${cnt}</div><div class="stat-label">${srv}</div></div>
      `).join('')}
    </div>`;
  document.getElementById('statsModal')?.classList.add('show');
}
function closeBackupModal(){ document.getElementById('backupModal')?.classList.remove('show'); }
function closeStatsModal(){ document.getElementById('statsModal')?.classList.remove('show'); }

// =============== IMPRESSÃO ===============
function updatePrintUnscheduledTable() {
  const uns = filterAppointments(appointments.filter(a => !a.date || !a.period)
    .sort((x,y)=> (x.sortIndex||0)-(y.sortIndex||0)));
  const tbody = document.getElementById('printUnscheduledTableBody'); if (!tbody) return;
  const sec = document.querySelector('.print-unscheduled-section');
  if (uns.length === 0) { if (sec) sec.style.display='none'; return; }
  if (sec) sec.style.display='block';
  tbody.innerHTML = uns.map(a => `
    <tr>
      <td>${a.plate ?? a.matricula ?? ''}</td>
      <td>${a.car ?? a.carro ?? ''}</td>
      <td><span class="service-badge badge-${a.service ?? a.servico ?? ''}">${a.service ?? a.servico ?? ''}</span></td>
      <td><span class="status-chip chip-${a.status ?? a.estado ?? ''}">${a.status ?? a.estado ?? ''}</span></td>
      <td>${a.notes ?? a.obs ?? ''}</td>
      <td>${a.extra ?? ''}</td>
    </tr>`).join('');
}
function updatePrintTomorrowTable() {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const iso = localISO(tomorrow);
  const list = appointments.filter(a => a.date === iso).sort((a,b)=>{
    const order = { 'Manhã':1, 'Tarde':2 };
    return (order[normalizePeriod(a.period ?? a.periodo)]||3)-(order[normalizePeriod(b.period ?? b.periodo)]||3);
  });
  const title = document.getElementById('printTomorrowTitle');
  const date  = document.getElementById('printTomorrowDate');
  if (title) title.textContent = 'SERVIÇOS DE AMANHÃ';
  if (date) date.textContent = cap(tomorrow.toLocaleDateString('pt-PT',{weekday:'long',year:'numeric',month:'long',day:'numeric'}));
  const tbody = document.getElementById('printTomorrowTableBody');
  const empty = document.getElementById('printTomorrowEmpty');
  const table = document.querySelector('.print-tomorrow-table');
  if (list.length === 0) { if (table) table.style.display='none'; if (empty) empty.style.display='block'; return; }
  if (table) table.style.display='table'; if (empty) empty.style.display='none';
  if (tbody) tbody.innerHTML = list.map(a => `
    <tr>
      <td>${normalizePeriod(a.period ?? a.periodo) || ''}</td>
      <td>${a.plate ?? a.matricula ?? ''}</td>
      <td>${a.car ?? a.carro ?? ''}</td>
      <td><span class="service-badge badge-${a.service ?? a.servico ?? ''}">${a.service ?? a.servico ?? ''}</span></td>
      <td><span class="status-chip chip-${a.status ?? a.estado ?? ''}">${a.status ?? a.estado ?? ''}</span></td>
      <td>${a.notes ?? a.obs ?? ''}</td>
      <td>${a.extra ?? ''}</td>
    </tr>`).join('');
}
function printPage(){ updatePrintUnscheduledTable(); updatePrintTomorrowTable(); window.print(); }

// =============== LOAD & INICIALIZAÇÃO ===============
async function load() {
  appointments = await apiGet('/api/appointments');
  appointments.forEach(a => {
    if (!a.id) a.id = Date.now() + Math.random();
    a.date = a.date ? parseISO(a.date) : parseISO(a.data);
    a.period = normalizePeriod(a.period ?? a.periodo);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await load();
    renderAll();

    // Navegação semana
    document.getElementById('prevWeek')?.addEventListener('click', () => { currentMonday = addDays(currentMonday,-7); renderAll(); });
    document.getElementById('nextWeek')?.addEventListener('click', () => { currentMonday = addDays(currentMonday, 7); renderAll(); });
    document.getElementById('todayWeek')?.addEventListener('click', () => { currentMonday = getMonday(new Date()); renderAll(); });

    // Navegação dia (mobile)
    document.getElementById('prevDay')?.addEventListener('click', () => { currentMobileDay = addDays(currentMobileDay,-1); renderMobileDay(); });
    document.getElementById('nextDay')?.addEventListener('click', () => { currentMobileDay = addDays(currentMobileDay, 1); renderMobileDay(); });
    document.getElementById('todayDay')?.addEventListener('click', () => { currentMobileDay = new Date(); renderMobileDay(); });

    // Imprimir
    document.getElementById('printPage')?.addEventListener('click', printPage);

    // Pesquisa (lupa)
    document.getElementById('searchBtn')?.addEventListener('click', () => {
      const bar = document.getElementById('searchBar');
      if (!bar) return;
      bar.classList.toggle('hidden');
      if (!bar.classList.contains('hidden')) document.getElementById('searchInput')?.focus();
    });
    document.getElementById('searchInput')?.addEventListener('input', e => { searchQuery = e.target.value || ''; renderAll(); });
    document.getElementById('clearSearch')?.addEventListener('click', () => {
      searchQuery = ''; const i=document.getElementById('searchInput'); if (i) i.value='';
      document.getElementById('searchBar')?.classList.add('hidden'); renderAll();
    });

    // Filtro de estado
    document.getElementById('filterStatus')?.addEventListener('change', e => { statusFilter = e.target.value || ''; renderAll(); });

    // Modal & Form
    document.getElementById('addServiceBtn')?.addEventListener('click', () => openAppointmentModal());
    document.getElementById('addServiceMobile')?.addEventListener('click', () => openAppointmentModal());
    document.getElementById('closeModal')?.addEventListener('click', closeAppointmentModal);
    document.getElementById('cancelForm')?.addEventListener('click', closeAppointmentModal);
    document.getElementById('deleteAppointment')?.addEventListener('click', () => { if (editingId) deleteAppointment(editingId); });
    document.getElementById('appointmentForm')?.addEventListener('submit', saveAppointment);
    document.getElementById('appointmentPlate')?.addEventListener('input', e => formatPlate(e.target));

    // Backup / Export / Import / Estatísticas
    document.getElementById('backupBtn')?.addEventListener('click', ()=> document.getElementById('backupModal')?.classList.add('show'));
    document.getElementById('statsBtn')?.addEventListener('click', showStats);
    document.getElementById('exportJson')?.addEventListener('click', exportToJson);
    document.getElementById('exportCsv')?.addEventListener('click', exportToCsv);
    document.getElementById('exportServices')?.addEventListener('click', exportToCsv);
    document.getElementById('importBtn')?.addEventListener('click', ()=> document.getElementById('importFile')?.click());
    document.getElementById('importFile')?.addEventListener('change', e => { const f=e.target.files?.[0]; if (f) importFromJson(f); });

    // Fechar modal clicando fora
    document.addEventListener('click', (e) => { if (e.target.classList?.contains('modal')) e.target.classList.remove('show'); });

    // Atalhos
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAppointmentModal();
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openAppointmentModal(); }
    });
  } catch (err) {
    console.error('Erro a iniciar:', err);
    showToast('Erro a iniciar: ' + err.message, 'error');
  }
});

// Expor para botões
window.editAppointment   = editAppointment;
window.deleteAppointment = deleteAppointment;
window.closeBackupModal  = closeBackupModal;
window.closeStatsModal   = closeStatsModal;
window.exportToCsv       = exportToCsv;
