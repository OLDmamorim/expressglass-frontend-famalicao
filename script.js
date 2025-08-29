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

/* Remove acentos */
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
  const max = Math.max(
    0,
    ...appointments
      .filter(x => bucketOf(x) === bucket)
      .map(x => Number(x.sortIndex) || 0)
  );
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

/* Dá sortIndex incremental a quem não tiver, por balde */
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
   FILTERS
=========================== */
function filterAppointments(list){
  let r=[...list];
  if(searchQuery){
    const q=searchQuery.toLowerCase();
    r=r.filter(a=>
      (a.plate||'').toLowerCase().includes(q) ||
      (a.car||'').toLowerCase().includes(q)   ||
      (a.notes||'').toLowerCase().includes(q) ||
      (a.extra||'').toLowerCase().includes(q)
    );
  }
  if(statusFilter) r=r.filter(a=>a.status===statusFilter);
  return r;
}
function highlightSearchResults(){
  if(!searchQuery) return;
  document.querySelectorAll('.appointment-block').forEach(el=>{
    el.classList.remove('highlight');
    if(el.textContent.toLowerCase().includes(searchQuery.toLowerCase())) el.classList.add('highlight');
  });
}

/* ===========================
   Drag & Drop
=========================== */
function enableDragDrop(scope){
  (scope||document).querySelectorAll('.appointment-block[data-id]').forEach(card=>{
    card.draggable=true;
    card.addEventListener('dragstart',e=>{
      e.dataTransfer.setData('text/plain',card.getAttribute('data-id'));
      e.dataTransfer.effectAllowed='move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend',()=> card.classList.remove('dragging'));
  });
  (scope||document).querySelectorAll('[data-drop-bucket]').forEach(zone=>{
    zone.addEventListener('dragover',e=>{ e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave',()=> zone.classList.remove('drag-over'));
    zone.addEventListener('drop',e=>{
      e.preventDefault(); zone.classList.remove('drag-over');
      const id=Number(e.dataTransfer.getData('text/plain'));
      const targetBucket=zone.getAttribute('data-drop-bucket');
      const targetIndex=zone.querySelectorAll('.appointment-block').length;
      onDropAppointment(id,targetBucket,targetIndex);
    });
  });
}
function normalizeBucketOrder(bucket){ const items=appointments.filter(a=>bucketOf(a)===bucket); items.forEach((it,i)=> it.sortIndex=i+1); }
async function onDropAppointment(id,targetBucket,targetIndex){
  const i=appointments.findIndex(a=>a.id==id); if(i<0) return;
  const a=appointments[i]; const prev={date:a.date,period:a.period,sortIndex:a.sortIndex};

  if(targetBucket==='unscheduled'){ a.date=''; a.period=''; }
  else { const [d,p]=targetBucket.split('|'); a.date=d; a.period=p||a.period||'Manhã'; }

  normalizeBucketOrder(targetBucket);
  const list=appointments.filter(x=>bucketOf(x)===targetBucket).sort((x,y)=>{
    const sx=(x.sortIndex??1e9), sy=(y.sortIndex??1e9);
    return sx===sy ? String(x.id).localeCompare(String(y.id)) : sx-sy;
  });
  list.forEach((x,idx)=> x.sortIndex=idx+1);
  if(targetIndex>=list.length) a.sortIndex = nextSortIndexFor(a.date, a.period);
  else { list.splice(targetIndex,0,a); list.forEach((x,idx)=> x.sortIndex=idx+1); }

  renderAll(); // otimista

  try{
    const payload = sanitizeForApi(a);
    const updated=await apiPut(`/api/appointments/${id}`, payload);
    if(updated && typeof updated==='object') Object.assign(a,updated);
    await load(); renderAll(); showToast('Agendamento movido!','success');
  }catch(e){
    a.date=prev.date; a.period=prev.period; a.sortIndex=prev.sortIndex; renderAll();
    showToast('Erro a gravar movimento: '+e.message,'error');
  }
}

/* ===========================
   RENDER
=========================== */
// ... (mantém renderSchedule, renderUnscheduled, renderMobileDay, renderServicesTable iguais)

/* Nova tabela: Vidros para Encomendar (NE de hoje até +3 dias) */
function renderToOrderTable(){
  const tbody = document.getElementById('toOrderTableBody');
  if(!tbody) return;

  const today = new Date();
  const end   = addDays(today, 3);
  const isoStart = localISO(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const isoEnd   = localISO(new Date(end.getFullYear(), end.getMonth(), end.getDate()));

  const rows = appointments
    .filter(a => a.status === 'NE' && a.date)
    .filter(a => a.date >= isoStart && a.date <= isoEnd)
    .sort((a,b) =>
      new Date(a.date) - new Date(b.date) ||
      (a.period === b.period ? 0 : (a.period === 'Manhã' ? -1 : 1)) ||
      ((a.sortIndex??1e9) - (b.sortIndex??1e9)) ||
      String(a.id).localeCompare(String(b.id))
    );

  tbody.innerHTML = rows.map(a => `
    <tr>
      <td>${new Date(a.date).toLocaleDateString('pt-PT')}</td>
      <td>${a.period || ''}</td>
      <td>${a.plate || ''}</td>
      <td>${a.car || ''}</td>
      <td>${a.service || ''}</td>
      <td>${a.notes || ''}</td>
      <td>${a.extra || ''}</td>
    </tr>
  `).join('');
}

function renderAll(){
  renderSchedule();
  renderUnscheduled();
  renderMobileDay();
  renderServicesTable();
  renderToOrderTable();  // nova chamada
}

/* ===========================
   CRUD + STATUS + PRINT + BOOT
=========================== */
// (mantém igual ao que já tens no teu ficheiro)