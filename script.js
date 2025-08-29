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
      appointments
        .filter(a=>a.date && a.date===iso && a.period===period)
        .sort((x,y)=>{
          const sx=(x.sortIndex??1e9), sy=(y.sortIndex??1e9);
          return sx===sy ? String(x.id).localeCompare(String(y.id)) : sx-sy;
        })
    );
    const blocks=items.map(a=>{
      return `<div class="appointment-block status-${a.status}" data-id="${a.id}" draggable="true">
                <div class="appt-header">
                  <strong>${(a.plate||'')}</strong> | ${(a.service||'')} | ${(a.car||'').toUpperCase()}
                </div>
                <div class="appt-sub">${a.notes||''}</div>
                <div class="appt-status">
                  <label><input type="checkbox" class="state-box" data-status="NE" ${a.status==='NE'?'checked':''}/> N/E</label>
                  <label><input type="checkbox" class="state-box" data-status="VE" ${a.status==='VE'?'checked':''}/> V/E</label>
                  <label><input type="checkbox" class="state-box" data-status="ST" ${a.status==='ST'?'checked':''}/> ST</label>
                </div>
                <div class="card-actions">
                  <button title="Editar" type="button" onclick="editAppointment(${a.id})">✏️</button>
                  <button title="Apagar" type="button" onclick="deleteAppointment(${a.id})">🗑️</button>
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
  highlightSearchResults();
}

/* Unscheduled */
function renderUnscheduled(){
  const container=document.getElementById('unscheduledList'); if(!container) return;

  const uns=filterAppointments(
    appointments
      .filter(a=>!a.date||!a.period)
      .sort((x,y)=>{
        const sx=(x.sortIndex??1e9), sy=(y.sortIndex??1e9);
        return sx===sy ? String(x.id).localeCompare(String(y.id)) : sx-sy;
      })
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
                <label><input type="checkbox" class="state-box" data-status="NE" ${a.status==='NE'?'checked':''}/> N/E</label>
                <label><input type="checkbox" class="state-box" data-status="VE" ${a.status==='VE'?'checked':''}/> V/E</label>
                <label><input type="checkbox" class="state-box" data-status="ST" ${a.status==='ST'?'checked':''}/> ST</label>
              </div>
              <div class="card-actions">
                <button title="Editar" type="button" onclick="editAppointment(${a.id})">✏️</button>
                <button title="Apagar" type="button" onclick="deleteAppointment(${a.id})">🗑️</button>
              </div>
            </div>`;
  }).join('');

  container.innerHTML = `<div class="drop-zone" data-drop-bucket="unscheduled">${blocks}</div>`;
  enableDragDrop(container);
  highlightSearchResults();
}

/* Mobile day */
function renderMobileDay(){
  const label=document.getElementById('mobileDayLabel');
  if(label){
    const s=currentMobileDay.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
    label.textContent=cap(s);
  }
  const iso=localISO(currentMobileDay);
  const dayItems=filterAppointments(
    appointments
      .filter(a=>a.date===iso)
      .sort((a,b)=> a.period!==b.period ? (a.period==='Manhã'?-1:1) :
            ((a.sortIndex??1e9)-(b.sortIndex??1e9)) || String(a.id).localeCompare(String(b.id)))
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

/* Services table (futuro) */
function renderServicesTable(){
  const tbody=document.getElementById('servicesTableBody'); if(!tbody) return;
  const today=new Date();
  const future=filterAppointments(
    appointments
      .filter(a=>a.date && new Date(a.date)>=new Date().setHours(0,0,0,0))
      .sort((a,b)=> new Date(a.date)-new Date(b.date) ||
                    ((a.sortIndex??1e9)-(b.sortIndex??1e9)) ||
                    String(a.id).localeCompare(String(b.id)))
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

/* ========= On-page: Vidros para encomendar (Hoje + 3) ========= */
function getToOrderRows(){
  const start = new Date(); start.setHours(0,0,0,0);
  const end   = addDays(start, 3);
  const inRange = (ds)=>{
    if(!ds) return false;
    const d = new Date(ds);
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate()); // dia local
    return dd >= start && dd <= end;
  };
  return appointments
    .filter(a=> a.status === 'NE' && a.date && inRange(a.date))
    .sort((a,b)=> new Date(a.date)-new Date(b.date) ||
                  (a.period===b.period ? 0 : (a.period==='Manhã'?-1:1)) ||
                  ((a.sortIndex??1e9)-(b.sortIndex??1e9)) ||
                  String(a.id).localeCompare(String(b.id)));
}

function renderToOrderTable(){
  const tbody = document.getElementById('toOrderTableBody');
  if(!tbody) return;
  const rows = getToOrderRows();
  tbody.innerHTML = rows.map(a=>{
    const dt = new Date(a.date);
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

/* ========= PRINT helpers ========= */
// helper robusto: compara string de data com um Date pelo dia LOCAL
function isSameLocalDay(dateStr, refDate){
  if (!dateStr) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr === localISO(refDate);
  }
  const a = new Date(dateStr);
  const b = new Date(refDate);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth() &&
    a.getDate()     === b.getDate()
  );
}

function updatePrintTodayTable(){
  const title=document.getElementById('printTodayTitle');
  const dateEl=document.getElementById('printTodayDate');
  const tbody=document.getElementById('printTodayTableBody');
  const empty=document.getElementById('printTodayEmpty');
  if(!tbody) return;

  const today = new Date();

  if(title) title.textContent='SERVIÇOS DE HOJE';
  if(dateEl) dateEl.textContent=today.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});

  const rows=appointments
    .filter(a=> isSameLocalDay(a.date, today))
    .sort((a,b)=> a.period!==b.period ? (a.period==='Manhã'?-1:1) :
          ((a.sortIndex??1e9)-(b.sortIndex??1e9)) || String(a.id).localeCompare(String(b.id)));

  if(rows.length===0){
    if(empty) empty.style.display='block';
    tbody.innerHTML='';
    return;
  }
  if(empty) empty.style.display='none';

  tbody.innerHTML = rows.map(a=>
    `<tr>
      <td>${a.period||''}</td>
      <td>${a.plate||''}</td>
      <td>${a.car||''}</td>
      <td>${a.service||''}</td>
      <td>${a.status||''}</td>
      <td>${a.notes||''}</td>
      <td>${a.extra||''}</td>
    </tr>`
  ).join('');
}

function updatePrintTomorrowTable(){
  const title=document.getElementById('printTomorrowTitle');
  const dateEl=document.getElementById('printTomorrowDate');
  const tbody=document.getElementById('printTomorrowTableBody');
  const empty=document.getElementById('printTomorrowEmpty'); if(!tbody) return;
  const tomorrow=addDays(new Date(),1); const iso=localISO(tomorrow);
  if(title) title.textContent='SERVIÇOS DE AMANHÃ';
  if(dateEl) dateEl.textContent=tomorrow.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
  const rows=appointments.filter(a=>a.date===iso).sort((a,b)=>
    (a.period!==b.period ? (a.period==='Manhã'?-1:1) :
    ((a.sortIndex??1e9)-(b.sortIndex??1e9)) || String(a.id).localeCompare(String(b.id)))
  );
  if(rows.length===0){ if(empty) empty.style.display='block'; tbody.innerHTML=''; return; }
  if(empty) empty.style.display='none';
  tbody.innerHTML = rows.map(a=>`<tr><td>${a.period||''}</td><td>${a.plate||''}</td><td>${a.car||''}</td><td>${a.service||''}</td><td>${a.status||''}</td><td>${a.notes||''}</td><td>${a.extra||''}</td></tr>`).join('');
}

/* Folha de impressão: Vidros para encomendar */
function updatePrintToOrderTable(){
  const title=document.getElementById('printToOrderTitle');
  const rangeEl=document.getElementById('printToOrderRange');
  const tbody=document.getElementById('printToOrderTableBody');
  if(!tbody) return;

  const start = new Date(); start.setHours(0,0,0,0);
  const end   = addDays(start, 3);

  if(title) title.textContent = 'VIDROS PARA ENCOMENDAR';
  if(rangeEl) rangeEl.textContent =
    `${start.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'2-digit'})} → ${end.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'2-digit'})}`;

  const rows = getToOrderRows();
  tbody.innerHTML = rows.map(a=>{
    const dt = new Date(a.date);
    return `<tr>
      <td>${dt.toLocaleDateString('pt-PT')}</td>
      <td>${a.period||''}</td>
      <td>${a.plate||''}</td>
      <td>${a.car||''}</td>
      <td>${a.service||''}</td>
      <td>${a.status||''}</td>
      <td>${a.notes||''}</td>
      <td>${a.extra||''}</td>
    </tr>`;
  }).join('');
}

/* ===========================
   Render All
=========================== */
function renderAll(){
  renderSchedule();
  renderUnscheduled();
  renderMobileDay();
  renderServicesTable();
  renderToOrderTable(); // on-page “Vidros para encomendar”
}

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
      document.getElementById('appointmentExtra').value  = a.extra||'';
      del.classList.remove('hidden');
    }
  }else{
    title.textContent='Novo Agendamento';
    if(form) form.reset();
    document.getElementById('appointmentStatus').value='NE';
    del.classList.add('hidden');
  }
  modal.classList.add('show');
}
function closeAppointmentModal(){ const m=document.getElementById('appointmentModal'); if(m) m.classList.remove('show'); editingId=null; }

function sanitizeForApi(a){
  const out = { ...a };
  out.date   = (out.date && String(out.date).trim() !== '') ? out.date : null;
  out.period = (out.period && String(out.period).trim() !== '') ? out.period : null;
  out.notes  = (out.notes  && String(out.notes).trim()  !== '') ? out.notes  : null;
  out.extra  = (out.extra  && String(out.extra).trim()  !== '') ? out.extra  : null;
  return out;
}

async function saveAppointment(){
  if (__savingAppointment) return;         // evita duplo submit
  __savingAppointment = true;

  const rawDate=document.getElementById('appointmentDate').value;
  const isEdit = !!editingId;

  let appointment={
    id: editingId || Date.now()+Math.random(),
    date: parseDate(rawDate),
    period: normalizePeriod(document.getElementById('appointmentPeriod').value),
    plate: (document.getElementById('appointmentPlate').value||'').toUpperCase(),
    car:   document.getElementById('appointmentCar').value,
    service: document.getElementById('appointmentService').value,
    status:  document.getElementById('appointmentStatus').value,
    notes:   document.getElementById('appointmentNotes').value,
    extra:   document.getElementById('appointmentExtra').value,
    sortIndex: 1
  };

  if(!appointment.plate || !appointment.car || !appointment.service){
    showToast('Preenche Matrícula, Carro e Serviço.','error');
    __savingAppointment = false;
    return;
  }

  // garante que entra no FIM do balde
  appointment.sortIndex = nextSortIndexFor(appointment.date, appointment.period);

  const submitBtn = document.querySelector('#appointmentForm .btn.primary');
  const prevTxt   = submitBtn ? submitBtn.textContent : '';
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'A guardar…'; }

  try{
    const payload = sanitizeForApi(appointment);

    if(isEdit){
      await apiPut(`/api/appointments/${editingId}`, payload);
      showToast('Agendamento atualizado!','success');
    }else{
      const { id, ...toCreate } = payload;   // backend gera id → evita clones
      await apiPost('/api/appointments', toCreate);
      showToast('Agendamento criado!','success');
    }

    await load(); renderAll(); closeAppointmentModal();
  }catch(e){
    console.error(e); showToast('Erro ao guardar: '+e.message,'error');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = prevTxt; }
    __savingAppointment = false;
  }
}
function editAppointment(id){ openAppointmentModal(id); }
async function deleteAppointment(id){
  if(!confirm('Eliminar este agendamento?')) return;
  try{
    await apiDelete(`/api/appointments/${id}`);
    await load(); renderAll(); showToast('Eliminado!','success');
    if(editingId==id) closeAppointmentModal();
  }
  catch(e){ console.error(e); showToast('Erro ao eliminar: '+e.message,'error'); }
}

/* Expor para onclick inline */
window.openAppointmentModal = openAppointmentModal;
window.editAppointment = editAppointment;
window.deleteAppointment = deleteAppointment;

/* ===========================
   STATUS (checkboxes) — delegação
=========================== */
async function __onStatusChange(e) {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.type !== 'checkbox') return;
  const statusKey = target.getAttribute('data-status'); // "NE" | "VE" | "ST"
  if (!statusKey) return;

  const card = target.closest('.appointment-block');
  if (!card) return;
  const id = Number(card.getAttribute('data-id'));
  const a = appointments.find(x => x.id == id);
  if (!a) return;

  // desmarca as outras boxes do mesmo cartão
  card.querySelectorAll('.appt-status input[type="checkbox"]').forEach(cb => {
    if (cb !== target) cb.checked = false;
  });

  // otimista
  const prevStatus = a.status;
  a.status = statusKey;

  // atualiza classes do cartão (cor)
  card.classList.remove('status-NE', 'status-VE', 'status-ST');
  card.classList.add('status-' + statusKey);

  try {
    const payload = sanitizeForApi(a);
    const updated = await apiPut(`/api/appointments/${id}`, payload);
    if (updated && typeof updated === 'object') Object.assign(a, updated);
    showToast(`Status gravado: ${statusKey}`, 'success');
  } catch (err) {
    // rollback
    a.status = prevStatus;
    card.classList.remove('status-NE', 'status-VE', 'status-ST');
    card.classList.add('status-' + prevStatus);
    card.querySelectorAll('.appt-status input[type="checkbox"]').forEach(cb => {
      cb.checked = cb.getAttribute('data-status') === prevStatus;
    });
    showToast('Erro a gravar status: ' + (err.message || err), 'error');
  }
}

function attachStatusListeners() {
  document.removeEventListener('change', __onStatusChange, true);
  document.addEventListener('change', __onStatusChange, true);
}

/* ===========================
   BOOT
=========================== */
document.addEventListener('DOMContentLoaded', async ()=>{
  // Semana
  document.getElementById('prevWeek')?.addEventListener('click', ()=>{ currentMonday=addDays(currentMonday,-7); renderAll(); });
  document.getElementById('nextWeek')?.addEventListener('click', ()=>{ currentMonday=addDays(currentMonday, 7); renderAll(); });
  document.getElementById('todayWeek')?.addEventListener('click', ()=>{ currentMonday=getMonday(new Date()); renderAll(); });

  // Mobile day
  document.getElementById('prevDay')?.addEventListener('click', ()=>{ currentMobileDay=addDays(currentMobileDay,-1); renderMobileDay(); });
  document.getElementById('todayDay')?.addEventListener('click', ()=>{ currentMobileDay=new Date(); renderMobileDay(); });
  document.getElementById('nextDay')?.addEventListener('click', ()=>{ currentMobileDay=addDays(currentMobileDay,1); renderMobileDay(); });

  // Imprimir (preenche 3 folhas e imprime; resto controlado por @media print)
  document.getElementById('printPage')?.addEventListener('click', ()=>{
    updatePrintTodayTable();
    updatePrintTomorrowTable();
    updatePrintToOrderTable();

    setTimeout(()=> {
      window.print();
      setTimeout(()=> location.reload(), 300);
    }, 50);
  });

  // Pesquisa
  document.getElementById('searchBtn')?.addEventListener('click', ()=>{
    const sb=document.getElementById('searchBar');
    if(sb){ sb.classList.toggle('hidden'); const i=document.getElementById('searchInput'); if(i) i.focus(); }
  });
  document.getElementById('searchInput')?.addEventListener('input', e=>{ searchQuery=e.target.value||''; renderAll(); });
  document.getElementById('clearSearch')?.addEventListener('click', ()=>{
    const i=document.getElementById('searchInput'); if(i) i.value=''; searchQuery=''; renderAll();
  });

  // Filtro estado
  document.getElementById('filterStatus')?.addEventListener('change', e=>{ statusFilter=e.target.value||''; renderAll(); });

  // Modal & form (único listener e “anti-fallbacks”)
  document.getElementById('closeModal')?.addEventListener('click', closeAppointmentModal);
  document.getElementById('cancelForm')?.addEventListener('click', closeAppointmentModal);
  const form = document.getElementById('appointmentForm');
  if (form){
    form.onsubmit = null;
    if (!__wiredForm){
      form.addEventListener('submit', (e)=>{ e.preventDefault(); e.stopImmediatePropagation(); saveAppointment(); }, true);
      __wiredForm = true;
      form.setAttribute('data-wired','1');
    }
  }
  document.getElementById('deleteAppointment')?.addEventListener('click', ()=>{ if(editingId) deleteAppointment(editingId); });

  // Estados
  attachStatusListeners();

  await load();
  renderAll();
});