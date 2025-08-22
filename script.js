/* ===========================
   API CONFIG
=========================== */
const API_BASE = 'https://expressglass-backend-famalicao.netlify.app';

/* -------- HTTP helpers (com tenant famalicão) -------- */
async function apiGet(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url, { headers: { 'X-Tenant-Id': 'famalicao' } });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

async function apiPost(path, data) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'famalicao' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST ${path} -> ${res.status} ${err}`);
  }
  return res.json();
}

async function apiPut(path, data) {
  const res = await fetch(API_BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'famalicao' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text().catch(()=> '');
    throw new Error(`PUT ${path} -> ${res.status} ${err}`);
  }
  try { return await res.json(); } catch { return null; }
}

async function apiDelete(path) {
  const res = await fetch(API_BASE + path, {
    method: 'DELETE',
    headers: { 'X-Tenant-Id': 'famalicao' }
  });
  if (!res.ok && res.status !== 204) throw new Error(`DELETE ${path} -> ${res.status}`);
  return true;
}

/* ===========================
   UTILITÁRIOS
=========================== */
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function getMonday(date) {
  const d = new Date(date); const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}
function localISO(date) {
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`;
}
function fmtHeader(date) {
  return {
    day: date.toLocaleDateString('pt-PT', { weekday: 'long' }),
    dm:  date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })
  };
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

/* Datas em strings */
function parseDate(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;          // YYYY-MM-DD
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {                  // DD/MM/YYYY
    const [d, m, y] = dateStr.split('/'); return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const dt = new Date(dateStr); return isNaN(dt) ? '' : localISO(dt);
}
function formatDateForInput(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y,m,d] = dateStr.split('-'); return `${d}/${m}/${y}`;
  }
  return dateStr;
}

/* Garante que o período é 'Manhã' ou 'Tarde' */
function normalizePeriod(p) {
  if (!p) return '';
  const t = String(p)
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .trim().toLowerCase();
  if (t === 'manha') return 'Manhã';
  if (t === 'tarde') return 'Tarde';
  return '';
}

/* Toast simples */
function showToast(msg, type='info') {
  const c = document.getElementById('toastContainer'); if (!c) return;
  const t = document.createElement('div'); t.className = `toast ${type}`;
  const icon = type==='success'?'✅':type==='error'?'❌':'ℹ️';
  t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  c.appendChild(t); setTimeout(()=>t.remove(), 3500);
}

/* Matrícula automática */
function formatPlate(input) {
  let v = input.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (v.length > 2) v = v.slice(0,2) + '-' + v.slice(2);
  if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5,7);
  input.value = v;
}

/* ===========================
   ESTADO
=========================== */
let appointments = [];
let currentMonday  = getMonday(new Date());
let currentMobileDay = new Date();
let editingId = null;
let searchQuery = '';
let statusFilter = '';

/* Mapeamento de cores por STATUS (cartão inteiro) */
const STATUS_BG = {
  NE: 'rgba(239, 68, 68, 0.12)',   // vermelho claro
  VE: 'rgba(245, 158, 11, 0.14)',  // laranja/amarelo claro
  ST: 'rgba(16, 185, 129, 0.14)'   // verde claro
};
const STATUS_BORDER = {
  NE: '#ef4444',
  VE: '#f59e0b',
  ST: '#10b981'
};

/* ===========================
   CARREGAR / GUARDAR
=========================== */
async function load() {
  try {
    showToast('A carregar…', 'info');

    const rows = await apiGet('/api/appointments');

    // Normalização imediata para garantir que o calendário popula
    appointments = rows.map(a => ({
      ...a,
      date: parseDate(a.date),                 // converte DD/MM/YYYY -> YYYY-MM-DD
      period: normalizePeriod(a.period),       // garante 'Manhã' / 'Tarde'
      id: a.id ?? (Date.now() + Math.random()),
      sortIndex: a.sortIndex ?? 1,
      status: a.status ?? 'NE'
    }));

    showToast('Dados carregados da API!', 'success');
  } catch (e) {
    appointments = [];
    showToast('Erro ao carregar: ' + e.message, 'error');
  }
}
// Mantemos save() por compatibilidade (o backend já persiste)
async function save(){}

/* ===========================
   FILTROS / PESQUISA
=========================== */
function filterAppointments(list) {
  let r = [...list];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    r = r.filter(a =>
      (a.plate || '').toLowerCase().includes(q) ||
      (a.car || '').toLowerCase().includes(q)   ||
      (a.notes || '').toLowerCase().includes(q) ||
      (a.extra || '').toLowerCase().includes(q)
    );
  }
  if (statusFilter) r = r.filter(a => a.status === statusFilter);
  return r;
}
function highlightSearchResults() {
  if (!searchQuery) return;
  document.querySelectorAll('.appointment-block').forEach(el => {
    el.classList.remove('highlight');
    const txt = el.textContent.toLowerCase();
    if (txt.includes(searchQuery.toLowerCase())) el.classList.add('highlight');
  });
}

/* ===========================
   DRAG & DROP
=========================== */
function enableDragDrop(scope) {
  (scope || document).querySelectorAll('.appointment-block[data-id]').forEach(card => {
    card.draggable = true;
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  (scope || document).querySelectorAll('[data-drop-bucket]').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      const id = Number(e.dataTransfer.getData('text/plain'));
      const targetBucket = zone.getAttribute('data-drop-bucket');
      const targetIndex  = zone.querySelectorAll('.appointment-block').length;
      onDropAppointment(id, targetBucket, targetIndex);
    });
  });
}
function bucketOf(a){ return (a.date && a.period) ? `${a.date}|${a.period}` : 'unscheduled'; }
function normalizeBucketOrder(bucket) {
  const items = appointments.filter(a => bucketOf(a) === bucket);
  items.forEach((item,i)=> item.sortIndex = i+1);
}
async function onDropAppointment(id, targetBucket, targetIndex) {
  const i = appointments.findIndex(a => a.id == id); if (i < 0) return;
  const a = appointments[i];

  const prev = { date: a.date, period: a.period, sortIndex: a.sortIndex };

  if (targetBucket === 'unscheduled') { a.date = ''; a.period = ''; }
  else {
    const [d,p] = targetBucket.split('|');
    a.date = d; a.period = p || a.period || 'Manhã';
  }
  normalizeBucketOrder(targetBucket);
  const list = appointments
    .filter(x => bucketOf(x) === targetBucket)
    .sort((x,y)=>(x.sortIndex||0)-(y.sortIndex||0));
  list.forEach((x,idx)=> x.sortIndex = idx+1);
  if (targetIndex >= list.length) a.sortIndex = list.length + 1;
  else { list.splice(targetIndex,0,a); list.forEach((x,idx)=> x.sortIndex=idx+1); }

  // Otimista
  renderAll();
  showToast('A guardar…', 'info');

  try {
    const updated = await apiPut(`/api/appointments/${id}`, a);
    if (updated && typeof updated === 'object') Object.assign(a, updated);
    showToast('Agendamento movido!', 'success');
    renderAll();
  } catch (e) {
    // Rollback
    a.date = prev.date; a.period = prev.period; a.sortIndex = prev.sortIndex;
    renderAll();
    showToast('Erro a gravar movimento: ' + e.message, 'error');
  }
}

/* ===========================
   RENDER
=========================== */
function renderSchedule() {
  const table = document.getElementById('schedule'); if (!table) return;
  table.innerHTML = '';

  const week = [...Array(5)].map((_,i)=> addDays(currentMonday, i));
  const r = `${week[0].toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit'})} - ${week[4].toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric'})}`;
  const wr = document.getElementById('weekRange'); if (wr) wr.textContent = r;

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
      appointments.filter(a => a.date && a.date === iso && a.period === period)
                  .sort((x,y)=>(x.sortIndex||0)-(y.sortIndex||0))
    );
    const blocks = items.map(a => {
      const bg = STATUS_BG[a.status] || 'rgba(0,0,0,0.06)';
      const border = STATUS_BORDER[a.status] || '#9ca3af';
      return `<div class="appointment-block" data-id="${a.id}" draggable="true"
                 style="background:${bg}; border-left:6px solid ${border}">
                <div class="appt-header">${(a.plate || '')} | ${(a.service || '')} | ${(a.car || '').toUpperCase()}</div>
                <div class="appt-sub">${a.notes ? a.notes : ''}</div>
                <div class="appt-status">
                  <label><input type="checkbox" data-status="NE" ${a.status==='NE'?'checked':''}/> N/E</label>
                  <label><input type="checkbox" data-status="VE" ${a.status==='VE'?'checked':''}/> V/E</label>
                  <label><input type="checkbox" data-status="ST" ${a.status==='ST'?'checked':''}/> ST</label>
                </div>
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
  enableDragDrop();
  attachStatusListeners();
  highlightSearchResults();
}

function renderUnscheduled() {
  const container = document.getElementById('unscheduledList'); if (!container) return;
  const uns = filterAppointments(
    appointments.filter(a=> !a.date || !a.period).sort((x,y)=>(x.sortIndex||0)-(y.sortIndex||0))
  );
  const blocks = uns.map(a => {
    const bg = STATUS_BG[a.status] || 'rgba(0,0,0,0.06)';
    const border = STATUS_BORDER[a.status] || '#9ca3af';
    return `<div class="appointment-block unscheduled" data-id="${a.id}" draggable="true"
              style="background:${bg}; border-left:6px solid ${border}">
              <div class="appt-header">${(a.plate || '')} | ${(a.service || '')} | ${(a.car || '').toUpperCase()}</div>
              <div class="appt-sub">${a.notes ? a.notes : ''}</div>
              <div class="appt-status">
                <label><input type="checkbox" data-status="NE" ${a.status==='NE'?'checked':''}/> N/E</label>
                <label><input type="checkbox" data-status="VE" ${a.status==='VE'?'checked':''}/> V/E</label>
                <label><input type="checkbox" data-status="ST" ${a.status==='ST'?'checked':''}/> ST</label>
              </div>
              <div class="unscheduled-actions">
                <button class="icon edit" onclick="editAppointment(${a.id})" title="Editar">✏️</button>
                <button class="icon delete" onclick="deleteAppointment(${a.id})" title="Eliminar">🗑️</button>
              </div>
            </div>`;
  }).join('');
  container.innerHTML = `<div class="drop-zone" data-drop-bucket="unscheduled">${blocks}</div>`;
  enableDragDrop();
  attachStatusListeners();
  highlightSearchResults();
}

function renderMobileDay() {
  const label = document.getElementById('mobileDayLabel'); if (label) {
    const dayStr = currentMobileDay.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
    label.textContent = cap(dayStr);
  }
  const iso = localISO(currentMobileDay);
  const dayItems = filterAppointments(
    appointments.filter(a => a.date === iso)
                .sort((a,b)=> a.period!==b.period ? (a.period==='Manhã'?-1:1) : (a.sortIndex||0)-(b.sortIndex||0))
  );
  const container = document.getElementById('mobileDayList'); if (!container) return;
  container.innerHTML = dayItems.map(a => {
    const bg = STATUS_BG[a.status] || 'rgba(0,0,0,0.06)';
    const border = STATUS_BORDER[a.status] || '#9ca3af';
    return `<div class="appointment-block"
              style="background:${bg}; border-left:6px solid ${border}; margin-bottom:10px;">
              <div class="appt-header">${a.period} - ${(a.plate || '')} | ${(a.service || '')} | ${(a.car || '').toUpperCase()}</div>
              <div class="appt-sub">${a.notes || ''}</div>
            </div>`;
  }).join('');
  highlightSearchResults();
}

function renderServicesTable() {
  const tbody = document.getElementById('servicesTableBody'); if (!tbody) return;
  const today = new Date();
  const future = filterAppointments(
    appointments.filter(a => a.date && new Date(a.date) >= new Date().setHours(0,0,0,0))
                .sort((a,b)=> new Date(a.date)-new Date(b.date))
  );
  tbody.innerHTML = future.map(a => {
    const dt = new Date(a.date);
    const diffDays = Math.ceil((dt - today)/(1000*60*60*24));
    const daysText = diffDays < 0 ? `${Math.abs(diffDays)} dias atrás`
                    : diffDays === 0 ? 'Hoje'
                    : diffDays === 1 ? 'Amanhã'
                    : `${diffDays} dias`;
    return `<tr>
      <td>${dt.toLocaleDateString('pt-PT')}</td>
      <td>${a.period || ''}</td>
      <td>${a.plate || ''}</td>
      <td>${a.car || ''}</td>
      <td><span class="badge badge-${a.service}">${a.service || ''}</span></td>
      <td>${a.notes || ''}</td>
      <td>${a.status || ''}</td>
      <td>${daysText}</td>
      <td class="no-print">
        <button class="table-btn" onclick="editAppointment(${a.id})">✏️</button>
        <button class="table-btn danger" onclick="deleteAppointment(${a.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('');
  const sum = document.getElementById('servicesSummary'); if (sum) sum.textContent = `${future.length} serviços pendentes`;
}

function renderAll(){ renderSchedule(); renderUnscheduled(); renderMobileDay(); renderServicesTable(); }

/* ===========================
   GESTÃO DE AGENDAMENTOS
=========================== */
function openAppointmentModal(id=null) {
  editingId = id;
  const modal = document.getElementById('appointmentModal'); if (!modal) return;
  const form  = document.getElementById('appointmentForm');
  const title = document.getElementById('modalTitle');
  const del   = document.getElementById('deleteAppointment');

  if (id) {
    const a = appointments.find(x=> x.id==id);
    if (a) {
      title.textContent = 'Editar Agendamento';
      document.getElementById('appointmentDate').value   = formatDateForInput(a.date) || '';
      document.getElementById('appointmentPeriod').value = a.period || '';
      document.getElementById('appointmentPlate').value  = a.plate || '';
      document.getElementById('appointmentCar').value    = a.car || '';
      document.getElementById('appointmentService').value= a.service || '';
      document.getElementById('appointmentStatus').value = a.status || 'NE';
      document.getElementById('appointmentNotes').value  = a.notes || '';
      document.getElementById('appointmentExtra').value  = a.extra || '';
      del.classList.remove('hidden');
    }
  } else {
    title.textContent = 'Novo Agendamento';
    form?.reset();
    document.getElementById('appointmentStatus').value = 'NE';
    del.classList.add('hidden');
  }
  modal.classList.add('show');
}
function closeAppointmentModal(){ const m=document.getElementById('appointmentModal'); m&&m.classList.remove('show'); editingId=null; }

async function saveAppointment() {
  const rawDate = document.getElementById('appointmentDate').value;
  const appointment = {
    id:     editingId || Date.now() + Math.random(),
    date:   parseDate(rawDate),
    period: normalizePeriod(document.getElementById('appointmentPeriod').value),
    plate:  document.getElementById('appointmentPlate').value.toUpperCase(),
    car:    document.getElementById('appointmentCar').value,
    service:document.getElementById('appointmentService').value,
    status: document.getElementById('appointmentStatus').value,
    notes:  document.getElementById('appointmentNotes').value,
    extra:  document.getElementById('appointmentExtra').value,
    sortIndex: 1
  };

  // Apenas os obrigatórios: Matrícula, Carro e Serviço
  if (!appointment.plate || !appointment.car || !appointment.service) {
    showToast('Por favor, preencha Matrícula, Carro e Serviço.', 'error'); return;
  }

  try {
    let result;
    if (editingId) {
      result = await apiPut(`/api/appointments/${editingId}`, appointment);
      const idx = appointments.findIndex(a => a.id == editingId);
      if (idx >= 0) appointments[idx] = { ...appointments[idx], ...(result || appointment) };
      showToast('Agendamento atualizado!', 'success');
    } else {
      result = await apiPost('/api/appointments', appointment);
      appointments.push(result || appointment);
      showToast('Agendamento criado!', 'success');
    }
    await save(); renderAll(); closeAppointmentModal();
  } catch (e) {
    console.error(e); showToast('Erro ao guardar: ' + e.message, 'error');
  }
}
function editAppointment(id){ openAppointmentModal(id); }

async function deleteAppointment(id) {
  if (!confirm('Eliminar este agendamento?')) return;
  try {
    await apiDelete(`/api/appointments/${id}`);
    appointments = appointments.filter(a => a.id != id);
    await save(); renderAll(); showToast('Agendamento eliminado!', 'success');
    if (editingId == id) closeAppointmentModal();
  } catch (e) { console.error(e); showToast('Erro ao eliminar: ' + e.message, 'error'); }
}

/* Status toggles — grava no backend e mantém o cartão visível */
function attachStatusListeners() {
  document.querySelectorAll('.appt-status input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async function() {
      const el = this.closest('.appointment-block');
      const id = Number(el.getAttribute('data-id'));
      const st = this.getAttribute('data-status');

      // Exclusividade visual
      el.querySelectorAll('.appt-status input[type="checkbox"]').forEach(x=>{ if(x!==this) x.checked=false; });

      const a = appointments.find(x => x.id == id);
      if (!a) return;

      // Otimista
      const prev = a.status;
      a.status = st;

      try {
        const updated = await apiPut(`/api/appointments/${id}`, a);
        if (updated && typeof updated === 'object') Object.assign(a, updated);

        // Se houver filtro ativo e o novo estado já não corresponder,
        // limpamos o filtro para manter o cartão visível.
        if (statusFilter && a.status !== statusFilter) {
          statusFilter = '';
          const sel = document.getElementById('filterStatus');
          if (sel) sel.value = '';
          showToast('Filtro limpo para continuares a ver o cartão.', 'info');
        }

        showToast(`Status gravado: ${st}`, 'success');
        renderAll();
      } catch (e) {
        // Rollback
        a.status = prev;
        showToast('Erro a gravar status: ' + e.message, 'error');
        renderAll();
      }
    });
  });
}

/* ===========================
   BACKUP / EXPORT
=========================== */
function exportToJson() {
  const data = { version:'3.0', exported:new Date().toISOString(), appointments };
  const blob = new Blob([JSON.stringify(data,null,2)], { type:'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href=url; a.download=`agendamentos_${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url);
  showToast('Backup JSON exportado!', 'success');
}
function exportToCsv() {
  const headers = ['Data','Período','Matrícula','Carro','Serviço','Status','Observações'];
  const rows = appointments.map(a => [a.date||'',a.period||'',a.plate||'',a.car||'',a.service||'',a.status||'',a.notes||'']);
  const csv = [headers,...rows].map(r => r.map(f => `"${f}"`).join(',')).join('\n');
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
          appointments = data.appointments; save(); renderAll(); showToast('Dados importados!', 'success');
          closeBackupModal();
        }
      } else showToast('Ficheiro inválido.', 'error');
    } catch (err) { showToast('Erro a ler ficheiro: ' + err.message, 'error'); }
  };
  rd.readAsText(file);
}

/* ===========================
   ESTATÍSTICAS / MODAIS
=========================== */
function generateStats() {
  const total = appointments.length;
  const scheduled = appointments.filter(a => a.date && a.period).length;
  const unscheduled = total - scheduled;
  const byStatus = { NE:0, VE:0, ST:0 };
  appointments.forEach(a => { if (byStatus[a.status] !== undefined) byStatus[a.status]++; });
  const byService = {}; appointments.forEach(a => { byService[a.service] = (byService[a.service]||0) + 1; });
  return { total, scheduled, unscheduled, byStatus, byService };
}
function showStats() {
  const s = generateStats(); const modal = document.getElementById('statsModal');
  const c = document.getElementById('statsContent');
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
  modal.classList.add('show');
}
function closeBackupModal(){ const m=document.getElementById('backupModal'); m&&m.classList.remove('show'); }
function closeStatsModal(){ const m=document.getElementById('statsModal');  m&&m.classList.remove('show'); }

/* ===========================
   IMPRESSÃO
=========================== */
function updatePrintUnscheduledTable() {
  const uns = filterAppointments(appointments.filter(a => !a.date || !a.period)
                                            .sort((x,y)=>(x.sortIndex||0)-(y.sortIndex||0)));
  const tbody = document.getElementById('printUnscheduledTableBody'); if (!tbody) return;
  const sec = document.querySelector('.print-unscheduled-section');
  if (uns.length === 0) { sec && (sec.style.display = 'none'); return; }
  sec && (sec.style.display = '');
  tbody.innerHTML = uns.map(a => `
    <tr>
      <td>${a.plate || ''}</td>
      <td>${a.car || ''}</td>
      <td>${a.service || ''}</td>
      <td>${a.status || ''}</td>
      <td>${a.notes || ''}</td>
      <td>${a.extra || ''}</td>
    </tr>
  `).join('');
}
function updatePrintTomorrowTable() {
  const title = document.getElementById('printTomorrowTitle');
  const dateEl= document.getElementById('printTomorrowDate');
  const tbody = document.getElementById('printTomorrowTableBody');
  const empty = document.getElementById('printTomorrowEmpty');
  if (!tbody) return;
  const tomorrow = addDays(new Date(), 1);
  const iso = localISO(tomorrow);
  title && (title.textContent = 'SERVIÇOS DE AMANHÃ');
  dateEl && (dateEl.textContent = tomorrow.toLocaleDateString('pt-PT', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' }));
  const rows = appointments.filter(a => a.date === iso)
                           .sort((a,b)=> a.period!==b.period ? (a.period==='Manhã'?-1:1) : (a.sortIndex||0)-(b.sortIndex||0));
  if (rows.length === 0) { empty && (empty.style.display='block'); tbody.innerHTML=''; return; }
  empty && (empty.style.display='none');
  tbody.innerHTML = rows.map(a => `
    <tr>
      <td>${a.period || ''}</td>
      <td>${a.plate || ''}</td>
      <td>${a.car || ''}</td>
      <td>${a.service || ''}</td>
      <td>${a.status || ''}</td>
      <td>${a.notes || ''}</td>
      <td>${a.extra || ''}</td>
    </tr>
  `).join('');
}

/* ===========================
   LST / EVENTOS
=========================== */
document.addEventListener('DOMContentLoaded', async () => {
  // Navegação semana
  document.getElementById('prevWeek')?.addEventListener('click', ()=>{ currentMonday = addDays(currentMonday,-7); renderAll(); });
  document.getElementById('nextWeek')?.addEventListener('click', ()=>{ currentMonday = addDays(currentMonday, 7); renderAll(); });
  document.getElementById('todayWeek')?.addEventListener('click', ()=>{ currentMonday = getMonday(new Date()); renderAll(); });

  // Impressão
  document.getElementById('printPage')?.addEventListener('click', ()=>{
    updatePrintUnscheduledTable();
    updatePrintTomorrowTable();
    window.print();
  });

  // Pesquisa
  document.getElementById('searchBtn')?.addEventListener('click', ()=>{
    const sb = document.getElementById('searchBar');
    sb?.classList.toggle('hidden');
    document.getElementById('searchInput')?.focus();
  });
  document.getElementById('searchInput')?.addEventListener('input', (e)=>{
    searchQuery = e.target.value || '';
    renderAll();
  });
  document.getElementById('clearSearch')?.addEventListener('click', ()=>{
    const i = document.getElementById('searchInput'); if (i) i.value='';
    searchQuery = ''; renderAll();
  });

  // Filtro por status (se existir no teu HTML)
  document.getElementById('filterStatus')?.addEventListener('change', (e)=>{
    statusFilter = e.target.value || '';
    renderAll();
  });

  // Ações formulário
  document.getElementById('addServiceBtn')?.addEventListener('click', ()=> openAppointmentModal());
  document.getElementById('addServiceMobile')?.addEventListener('click', ()=> openAppointmentModal());
  document.getElementById('closeModal')?.addEventListener('click', closeAppointmentModal);
  document.getElementById('cancelForm')?.addEventListener('click', closeAppointmentModal);
  document.getElementById('appointmentForm')?.addEventListener('submit', (e)=>{ e.preventDefault(); saveAppointment(); });
  document.getElementById('deleteAppointment')?.addEventListener('click', ()=>{ if (editingId) deleteAppointment(editingId); });

  // Backup/Estatísticas
  document.getElementById('backupBtn')?.addEventListener('click', ()=> document.getElementById('backupModal')?.classList.add('show'));
  document.getElementById('statsBtn')?.addEventListener('click', showStats);
  document.getElementById('importBtn')?.addEventListener('click', ()=> document.getElementById('importFile')?.click());
  document.getElementById('importFile')?.addEventListener('change', (e)=>{
    const f = e.target.files?.[0]; if (f) importFromJson(f);
  });
  document.getElementById('exportJson')?.addEventListener('click', exportToJson);
  document.getElementById('exportCsv')?.addEventListener('click', exportToCsv);

  // Carregar e renderizar
  await load();
  renderAll();
});
