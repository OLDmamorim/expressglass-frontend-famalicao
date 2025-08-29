'use strict';

/* ===========================
   API CONFIG
=========================== */
const API_BASE = 'https://expressglass-backend-famalicao.netlify.app';

/* -------- HTTP helpers -------- */
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
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}
async function apiPut(path, data) {
  const res = await fetch(API_BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'famalicao' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`PUT ${path} -> ${res.status} ${await res.text().catch(()=> '')}`);
  try { return await res.json(); } catch { return null; }
}
async function apiDelete(path) {
  const res = await fetch(API_BASE + path, { method: 'DELETE', headers: { 'X-Tenant-Id': 'famalicao' } });
  if (!res.ok && res.status !== 204) throw new Error(`DELETE ${path} -> ${res.status}`);
  return true;
}

/* ===========================
   UTILS
=========================== */
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function getMonday(date) { const d = new Date(date); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); return new Date(d.setDate(diff)); }
function localISO(date) { const y=date.getFullYear(), m=String(date.getMonth()+1).padStart(2,'0'), d=String(date.getDate()).padStart(2,'0'); return `${y}-${m}-${d}`; }
function fmtHeader(date){ return { day: date.toLocaleDateString('pt-PT',{weekday:'long'}), dm: date.toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit'}) }; }
function cap(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : ''; }

function parseDate(dateStr){
  if(!dateStr) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)){
    const [d,m,y]=dateStr.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const dt = new Date(dateStr);
  return isNaN(dt)?'':localISO(dt);
}
function formatDateForInput(dateStr){
  if(!dateStr) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(dateStr)){
    const [y,m,d]=dateStr.split('-'); return `${d}/${m}/${y}`;
  }
  return dateStr;
}
function normalizePeriod(p){
  if(!p) return '';
  const t = String(p).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  if(t==='manha') return 'Manhã';
  if(t==='tarde') return 'Tarde';
  return '';
}
function showToast(msg,type='info'){
  const c=document.getElementById('toastContainer');
  if(!c){ console.log(type.toUpperCase()+':', msg); return; }
  const t=document.createElement('div');
  t.className=`toast ${type}`;
  const icon=type==='success'?'✅':type==='error'?'❌':'ℹ️';
  t.innerHTML=`<span>${icon}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(()=>t.remove(),3500);
}
function formatPlate(input){
  let v=(input.value||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  if(v.length>2)v=v.slice(0,2)+'-'+v.slice(2);
  if(v.length>5)v=v.slice(0,5)+'-'+v.slice(5,7);
  input.value=v;
}

/* ===========================
   STATE
=========================== */
let appointments = [];
let currentMonday  = getMonday(new Date());
let currentMobileDay = new Date();
let editingId = null;
let searchQuery = '';
let statusFilter = '';
let __wiredForm = false;
let __savingAppointment = false;

/* ===========================
   ORDEM & DEDUPE
=========================== */
function bucketOf(a){ return (a.date && a.period) ? `${a.date}|${a.period}` : 'unscheduled'; }
function nextSortIndexFor(date, period){
  const bucket = (date && period) ? `${date}|${period}` : 'unscheduled';
  const max = Math.max(0,...appointments.filter(x=>bucketOf(x)===bucket).map(x => Number(x.sortIndex) || 0));
  return max + 1;
}
function dedupeByIdOrKey(rows){
  const seen = new Map();
  rows.forEach(a=>{
    const key = String(a.id ?? `${a.plate}|${a.car}|${a.date||''}|${a.period||''}|${a.service||''}`);
    if (!seen.has(key)) seen.set(key, a);
  });
  return Array.from(seen.values());
}
function normalizeAllBucketsOrder(list){
  const byBucket = new Map();
  list.forEach(a=>{
    const b = bucketOf(a);
    if(!byBucket.has(b)) byBucket.set(b, []);
    byBucket.get(b).push(a);
  });
  byBucket.forEach(items=>{
    items.sort((x,y)=>{
      const sx = (x.sortIndex ?? 1e9);
      const sy = (y.sortIndex ?? 1e9);
      if (sx !== sy) return sx - sy;
      return String(x.id).localeCompare(String(y.id));
    });
    let i = 1;
    items.forEach(it=>{
      if (it.sortIndex == null || isNaN(it.sortIndex)) it.sortIndex = i;
      i++;
    });
  });
  return list;
}

/* ===========================
   LOAD
=========================== */
async function load(){
  try{
    const rows = await apiGet('/api/appointments');
    const mapped = rows.map(a=>({
      ...a,
      date: parseDate(a.date),
      period: normalizePeriod(a.period),
      id: a.id ?? (Date.now()+Math.random()),
      sortIndex: (a.sortIndex != null ? Number(a.sortIndex) : null),
      status: a.status ?? 'NE'
    }));
    appointments = normalizeAllBucketsOrder(dedupeByIdOrKey(mapped));
  }catch(e){
    appointments=[]; showToast('Erro ao carregar: '+e.message,'error');
  }
}

/* ===========================
   RENDER TABELAS
=========================== */
function renderGlassOrdersTable(){
  const tbody = document.getElementById('glassOrdersTableBody');
  if(!tbody) return;

  const today = new Date();
  const limit = addDays(today,3);
  const rows = appointments.filter(a=>{
    if(a.status!=='NE') return false;
    if(!a.date) return false;
    const d=new Date(a.date);
    return d>=today.setHours(0,0,0,0) && d<=limit;
  }).sort((a,b)=> new Date(a.date)-new Date(b.date));

  tbody.innerHTML = rows.map(a=>{
    const dt=new Date(a.date);
    return `<tr>
      <td>${dt.toLocaleDateString('pt-PT')}</td>
      <td>${a.period||''}</td>
      <td>${a.plate||''}</td>
      <td>${a.car||''}</td>
      <td>${a.service||''}</td>
      <td>${a.notes||''}</td>
      <td>${a.extra||''}</td>
    </tr>`;
  }).join('');
}

/* ===========================
   PRINT HELPERS
=========================== */
function updatePrintGlassOrdersTable(){
  const tbody=document.getElementById('printGlassOrdersTableBody');
  const empty=document.getElementById('printGlassOrdersEmpty');
  if(!tbody) return;

  const today=new Date();
  const limit=addDays(today,3);
  const rows=appointments.filter(a=>{
    if(a.status!=='NE') return false;
    if(!a.date) return false;
    const d=new Date(a.date);
    return d>=today.setHours(0,0,0,0) && d<=limit;
  }).sort((a,b)=> new Date(a.date)-new Date(b.date));

  if(rows.length===0){
    if(empty) empty.style.display='block';
    tbody.innerHTML='';
    return;
  }
  if(empty) empty.style.display='none';
  tbody.innerHTML = rows.map(a=>{
    const dt=new Date(a.date);
    return `<tr>
      <td>${dt.toLocaleDateString('pt-PT')}</td>
      <td>${a.period||''}</td>
      <td>${a.plate||''}</td>
      <td>${a.car||''}</td>
      <td>${a.service||''}</td>
      <td>${a.notes||''}</td>
      <td>${a.extra||''}</td>
    </tr>`;
  }).join('');
}

/* ===========================
   BOOT
=========================== */
document.addEventListener('DOMContentLoaded', async ()=>{
  await load();
  renderAll();
  renderGlassOrdersTable();

  document.getElementById('printPage')?.addEventListener('click', ()=>{
    updatePrintTodayTable();
    updatePrintTomorrowTable();
    updatePrintGlassOrdersTable();

    document.querySelectorAll(
      '.schedule-container, .unscheduled-container, .services-table-container, .mobile-day-container, .search-bar, .nav-bar, .page-header, .no-print, .glass-orders-container'
    ).forEach(el=> el.style.display='none');

    document.querySelector('.print-today-section')?.style.display='block';
    document.querySelector('.print-tomorrow-section')?.style.display='block';
    document.querySelector('.print-glassorders-section')?.style.display='block';

    window.print();
    setTimeout(()=>location.reload(),300);
  });
});
