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
    const rows = await apiGet('/api/appointments');
    appointments = rows.map(a => ({
      ...a,
      date: parseDate(a.date),
      period: normalizePeriod(a.period),
      id: a.id ?? (Date.now() + Math.random()),
      sortIndex: a.sortIndex ?? 1,
      status: a.status ?? 'NE'
    }));
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
  const a = appointments[i]()
