'use strict';

/* ===========================
   API CONFIG
=========================== */
const API_BASE = 'https://expressglass-backend-famalicao.netlify.app';

/* -------- HTTP helpers -------- */
async function apiGet(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
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
  if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)){ const [d,m,y]=dateStr.split('/'); return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
  const dt = new Date(dateStr); return isNaN(dt)?'':localISO(dt);
}
function formatDateForInput(dateStr){ if(!dateStr) return ''; if(/^\d{4}-\d{2}-\d{2}$/.test(dateStr)){ const [y,m,d]=dateStr.split('-'); return `${d}/${m}/${y}`; } return dateStr; }

/* Compat Android/WebView: remover acentos sem \p{Diacritic} */
function normalizePeriod(p){
  if(!p) return '';
  const t = String(p).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  if(t==='manha') return 'Manhã';
  if(t==='tarde') return 'Tarde';
  return '';
}

function showToast(msg,type='info'){ const c=document.getElementById('toastContainer'); if(!c) return; const t=document.createElement('div'); t.className=`toast ${type}`; const icon=type==='success'?'✅':type==='error'?'❌':'ℹ️'; t.innerHTML=`<span>${icon}</span><span>${msg}</span>`; c.appendChild(t); setTimeout(()=>t.remove(),3500); }
function formatPlate(input){ let v=input.value.replace(/[^A-Za-z0-9]/g,'').toUpperCase(); if(v.length>2)v=v.slice(0,2)+'-'+v.slice(2); if(v.length>5)v=v.slice(0,5)+'-'+v.slice(5,7); input.value=v; }

/* ===========================
   STATE
=========================== */
let appointments = [];
let currentMonday  = getMonday(new Date());
let currentMobileDay = new Date();
let editingId = null;
let searchQuery = '';
let statusFilter = '';

/* ===========================
   LOAD
=========================== */
async function load(){
  try{
    const rows = await apiGet('/api/appointments');
    appointments = rows.map(a=>({
      ...a,
      date: parseDate(a.date),
      period: normalizePeriod(a.period),
      id: a.id ?? (Date.now()+Math.random()),
      sortIndex: a.sortIndex ?? 1,
      status: a.status ?? 'NE'
    }));
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
   DnD
=========================== */
function enableDragDrop(scope){
  (scope||document).querySelectorAll('.appointment-block[data-id]').forEach(card=>{
    card.draggable=true;
    card.addEventListener('dragstart',e=>{ e.dataTransfer.setData('text/plain',card.getAttribute('data-id')); e.dataTransfer.effectAllowed='move'; card.classList.add('dragging'); });
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
function bucketOf(a){ return (a.date && a.period) ? `${a.date}|${a.period}` : 'unscheduled'; }
function normalizeBucketOrder(bucket){ const items=appointments.filter(a=>bucketOf(a)===bucket); items.forEach((it,i)=> it.sortIndex=i+1); }
async function onDropAppointment(id,targetBucket,targetIndex){
  const i=appointments.findIndex(a=>a.id==id); if(i<0) return;
  const a=appointments[i]; const prev={date:a.date,period:a.period,sortIndex:a.sortIndex};

  if(targetBucket==='unscheduled'){ a.date=''; a.period=''; }
  else { const [d,p]=targetBucket.split('|'); a.date=d; a.period=p||a.period||'Manhã'; }

  normalizeBucketOrder(targetBucket);
  const list=appointments.filter(x=>bucketOf(x)===targetBucket).sort((x,y)=>(x.sortIndex||0)-(y.sortIndex||0));
  list.forEach((x,idx)=> x.sortIndex=idx+1);
  if(targetIndex>=list.length) a.sortIndex=list.length+1;
  else { list.splice(targetIndex,0,a); list.forEach((x,idx)=> x.sortIndex=idx+1); }

  renderAll(); // otimista

  try{
    const updated=await apiPut(`/api/appointments/${id}`,a);
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
function renderSchedule(){
  const table=document.getElementById('schedule'); if(!table) return; table.innerHTML='';

  // Segunda -> Sábado (6 dias)
  const week=[...Array(6)].map((_,i)=> addDays(currentMonday,i));
  const wr=document.getElementById('weekRange');
  if(wr){ wr.textContent = `${week[0].toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit'})} - ${week[5].toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric'})}`; }

  let thead='<thead><tr><th>Período</th>';
  for(const d of week){ const h=fmtHeader(d); thead+=`<th><div class="day">${cap(h.day)}</div><div class="date">${h.dm}</div></th>`; }
  thead+='</tr></thead>'; table.insertAdjacentHTML('beforeend',thead);

  const renderCell=(period,dayDate)=>{
    const iso=localISO(dayDate);
    const items=filterAppointments(
      appointments.filter(a=>a.date && a.date===iso && a.period===period).sort((x,y)=>(x.sortIndex||0)-(y.sortIndex||0))
    );
    const blocks=items.map(a=>{
      return `<div class="appointment-block status-${a.status}" data-id="${a.id}" draggable="true">
                <div class="appt-header">
                  <strong>${(a.plate||'')}</strong> | ${(a.service||'')} | ${(a.car||'').toUpperCase()}
                </div>
                <div class="appt-sub">${a.notes||''}</div>
                <div class="appt-status">
                  <label><input type="checkbox" data-status="NE" ${a.status==='NE'?'checked':''}/> N/E</label>
                  <label><input type="checkbox" data-status="VE" ${a.status==='VE'?'checked':''}/> V/E</label>
                  <label><input type="checkbox" data-status="ST" ${a.status==='ST'?'checked':''}/> ST</label>
                </div>
              </div>`;
    }).join('');
    return `<div class="drop-zone" data-drop-bucket="${iso}|${period}">${blocks}</div>`;
  };

  const tbody=document.createElement('tbody');
  ['Manhã','Tarde'].forEach(period=>{
    const row=document.createElement('tr');
    row.innerHTML = `<th>${period}</th>` + week.map(d=>`<td>${renderCell(period,d)}</td>`).join('');
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  enableDragDrop();
  attachStatusListeners();
  highlightSearchResults();
}

/* Unscheduled */
function renderUnscheduled(){
  const container=document.getElementById('unscheduledList'); if(!container) return;

  const uns=filterAppointments(
    appointments.filter(a=>!a.date||!a.period).sort((x,y)=>(x.sortIndex||0)-(y.sortIndex||0))
  );

  if (uns.length === 0){
    container.innerHTML =
      `<div class="drop-zone empty" data-drop-bucket="unscheduled">
         <div class="unscheduled-empty-msg">
           Sem serviços por agendar.
           <small>Arrasta para aqui a partir do calendário, ou clica em “+ Novo Serviço”.</small>
         </div>
       </div>`;
    enableDragDrop(container);
    return;
  }

  const blocks=uns.map(a=>{
    return `<div class="appointment-block status-${a.status}" data-id="${a.id}" draggable="true">
              <div class="appt-header">
                <strong>${(a.plate||'')}</strong> | ${(a.service||'')} | ${(a.car||'').toUpperCase()}
              </div>
              <div class="appt-sub">${a.notes||''}</div>
              <div class="appt-status">
                <label><input type="checkbox" data-status="NE" ${a.status==='NE'?'checked':''}/> N/E</label>
                <label><input type="checkbox" data-status="VE" ${a.status==='VE'?'checked':''}/> V/E</label>
                <label><input type="checkbox" data-status="ST" ${a.status==='ST'?'checked':''}/> ST</label>
              </div>
              <div class="unscheduled-actions">
                <button class="icon edit" type="button" onclick="editAppointment(${a.id})" title="Editar">✏️</button>
                <button class="icon delete" type="button" onclick="deleteAppointment(${a.id})" title="Eliminar">🗑️</button>
              </div>
            </div>`;
  }).join('');

  container.innerHTML = `<div class="drop-zone" data-drop-bucket="unscheduled">${blocks}</div>`;
  enableDragDrop(container);
  attachStatusListeners();
  highlightSearchResults();
}

function renderMobileDay(){
  const label=document.getElementById('mobileDayLabel');
  if(label){ const s=currentMobileDay.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}); label.textContent=cap(s); }
  const iso=localISO(currentMobileDay);
  const dayItems=filterAppointments(
    appointments.filter(a=>a.date===iso).sort((a,b)=> a.period!==b.period ? (a.period==='Manhã'?-1:1) : (a.sortIndex||0)-(b.sortIndex||0))
  );
  const container=document.getElementById('mobileDayList'); if(!container) return;
  container.innerHTML = dayItems.map(a=>{
    return `<div class="appointment-block status-${a.status}" style="margin-bottom:10px;" data-id="${a.id}">
              <div class="appt-header">${a.period} - ${(a.plate||'')} | ${(a.service||'')} | ${(a.car||'').toUpperCase()}</div>
              <div class="appt-sub">${a.notes||''}</div>
            </div>`;
  }).join('');
  highlightSearchResults();
}

function renderServicesTable(){
  const tbody=document.getElementById('servicesTableBody'); if(!tbody) return;
  const today=new Date();
  const future=filterAppointments(
    appointments.filter(a=>a.date && new Date(a.date)>=new Date().setHours(0,0,0,0)).sort((a,b)=> new Date(a.date)-new Date(b.date))
  );
  tbody.innerHTML = future.map(a=>{
    const dt=new Date(a.date); const diff=Math.ceil((dt-today)/(1000*60*60*24));
    const daysText = diff<0?`${Math.abs(diff)} dias atrás` : diff===0?'Hoje' : diff===1?'Amanhã' : `${diff} dias`;
    return `<tr>
      <td>${dt.toLocaleDateString('pt-PT')}</td>
      <td>${a.period||''}</td>
      <td>${a.plate||''}</td>
      <td>${a.car||''}</td>
      <td><span class="badge badge-${a.service}">${a.service||''}</span></td>
      <td>${a.notes||''}</td>
      <td>${a.status||''}</td>
      <td>${daysText}</td>
      <td class="no-print">
        <button class="table-btn" type="button" onclick="editAppointment(${a.id})">✏️</button>
        <button class="table-btn danger" type="button" onclick="deleteAppointment(${a.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('');
  const sum=document.getElementById('servicesSummary'); if(sum) sum.textContent = `${future.length} serviços pendentes`;
}

function renderAll(){ renderSchedule(); renderUnscheduled(); renderMobileDay(); renderServicesTable(); }

/* ===========================
   CRUD
=========================== */
function openAppointmentModal(id=null){
  const modal=document.getElementById('appointmentModal'); if(!modal){ showToast('Modal não encontrado.','error'); return; }
  editingId=id;
  const form=document.getElementById('appointmentForm');
  const title=document.getElementById('modalTitle');
  const del=document.getElementById('deleteAppointment');

  if(id){
    const a=appointments.find(x=>x.id==id);
    if(a){
      title.textContent='Editar Agendamento';
      document.getElementById('appointmentDate').value   = formatDateForInput(a.date)||'';
      document.getElementById('appointmentPeriod').value = a.period||'';
      document.getElementById('appointmentPlate').value  = a.plate||'';
      document.getElementById('appointmentCar').value    = a.car||'';
      document.getElementById('appointmentService').value= a.service||'';
      document.getElementById('appointmentStatus').value = a.status||'NE';
      document.getElementById('appointmentNotes').value  = a.notes||'';
      document.getElement