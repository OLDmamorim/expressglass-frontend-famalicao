'use strict';

/* ===========================
   API CONFIG
=========================== */
var API_BASE = 'https://expressglass-backend-famalicao.netlify.app';

/* -------- HTTP helpers -------- */
function apiGet(path, params) {
  params = params || {};
  var url = new URL(API_BASE + path);
  Object.keys(params).forEach(function (k) {
    var v = params[k];
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  return fetch(url, { headers: { 'X-Tenant-Id': 'famalicao' } })
    .then(function (res) {
      if (!res.ok) throw new Error('GET ' + path + ' -> ' + res.status);
      return res.json();
    });
}
function apiPost(path, data) {
  return fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'famalicao' },
    body: JSON.stringify(data)
  }).then(function (res) {
    if (!res.ok) return res.text().then(function (t) { throw new Error('POST ' + path + ' -> ' + res.status + ' ' + t); });
    return res.json();
  });
}
function apiPut(path, data) {
  return fetch(API_BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'famalicao' },
    body: JSON.stringify(data)
  }).then(function (res) {
    if (!res.ok) return res.text().then(function (t) { throw new Error('PUT ' + path + ' -> ' + res.status + ' ' + t); });
    return res.json().catch(function () { return null; });
  });
}
function apiDelete(path) {
  return fetch(API_BASE + path, { method: 'DELETE', headers: { 'X-Tenant-Id': 'famalicao' } })
    .then(function (res) {
      if (!res.ok && res.status !== 204) throw new Error('DELETE ' + path + ' -> ' + res.status);
      return true;
    });
}

/* ===========================
   UTILS
=========================== */
function $(id){ return document.getElementById(id); }
function addDays(date, days) { var d = new Date(date); d.setDate(d.getDate() + days); return d; }
function getMonday(date) { var d = new Date(date); var day = d.getDay(); var diff = d.getDate() - day + (day === 0 ? -6 : 1); return new Date(d.setDate(diff)); }
function localISO(date) { var y=date.getFullYear(), m=String(date.getMonth()+1).padStart(2,'0'), d=String(date.getDate()).padStart(2,'0'); return y+'-'+m+'-'+d; }
function fmtHeader(date){ return { day: date.toLocaleDateString('pt-PT',{weekday:'long'}), dm: date.toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit'}) }; }
function cap(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : ''; }

function parseDate(dateStr){
  if(!dateStr) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)){
    var p=dateStr.split('/'); var d=p[0], m=p[1], y=p[2];
    return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  }
  var dt = new Date(dateStr); return isNaN(dt)?'':localISO(dt);
}
function formatDateForInput(dateStr){
  if(!dateStr) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(dateStr)){
    var s=dateStr.split('-'); return s[2]+'/'+s[1]+'/'+s[0];
  }
  return dateStr;
}

/* remover acentos */
function normalizePeriod(p){
  if(!p) return '';
  var t = String(p).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  if(t==='manha') return 'Manhã';
  if(t==='tarde') return 'Tarde';
  return '';
}

function showToast(msg,type){
  type = type || 'info';
  var c=$('toastContainer'); if(!c){ alert(msg); return; }
  var t=document.createElement('div');
  t.className='toast '+type;
  var icon=type==='success'?'✅':(type==='error'?'❌':'ℹ️');
  t.innerHTML='<span>'+icon+'</span><span>'+msg+'</span>';
  c.appendChild(t);
  setTimeout(function(){ if(t && t.parentNode) t.parentNode.removeChild(t); },3500);
}
function formatPlate(input){
  var v=(input.value||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  if(v.length>2) v=v.slice(0,2)+'-'+v.slice(2);
  if(v.length>5) v=v.slice(0,5)+'-'+v.slice(5,7);
  input.value=v;
}

/* ===========================
   STATE
=========================== */
var appointments = [];
var currentMonday  = getMonday(new Date());
var currentMobileDay = new Date();
var editingId = null;
var searchQuery = '';
var statusFilter = '';

/* ===========================
   LOAD
=========================== */
function load(){
  return apiGet('/api/appointments').then(function(rows){
    appointments = rows.map(function(a){
      return {
        id: (a && a.id) ? a.id : (Date.now()+Math.random()),
        date: parseDate(a && a.date),
        period: normalizePeriod(a && a.period),
        plate: a && a.plate,
        car: a && a.car,
        service: a && a.service,
        status: (a && a.status) ? a.status : 'NE',
        notes: a && a.notes,
        extra: a && a.extra,
        sortIndex: (a && a.sortIndex) ? a.sortIndex : 1
      };
    });
  }).catch(function(e){
    appointments = [];
    showToast('Erro ao carregar: '+e.message,'error');
  });
}

/* ===========================
   FILTERS
=========================== */
function filterAppointments(list){
  var r=list.slice();
  if(searchQuery){
    var q=searchQuery.toLowerCase();
    r=r.filter(function(a){
      return ((a.plate||'').toLowerCase().indexOf(q)>-1) ||
             ((a.car||'').toLowerCase().indexOf(q)>-1)   ||
             ((a.notes||'').toLowerCase().indexOf(q)>-1) ||
             ((a.extra||'').toLowerCase().indexOf(q)>-1);
    });
  }
  if(statusFilter) r=r.filter(function(a){ return a.status===statusFilter; });
  return r;
}
function highlightSearchResults(){
  if(!searchQuery) return;
  var els=document.querySelectorAll('.appointment-block');
  for(var i=0;i<els.length;i++){
    var el=els[i];
    if(el.textContent.toLowerCase().indexOf(searchQuery.toLowerCase())>-1) el.classList.add('highlight');
    else el.classList.remove('highlight');
  }
}

/* ===========================
   DnD
=========================== */
function enableDragDrop(scope){
  scope = scope || document;
  var cards = scope.querySelectorAll('.appointment-block[data-id]');
  for(var i=0;i<cards.length;i++){
    (function(card){
      card.draggable=true;
      card.addEventListener('dragstart',function(e){
        e.dataTransfer.setData('text/plain',card.getAttribute('data-id'));
        e.dataTransfer.effectAllowed='move';
        card.classList.add('dragging');
      });
      card.addEventListener('dragend',function(){ card.classList.remove('dragging'); });
    })(cards[i]);
  }
  var zones = scope.querySelectorAll('[data-drop-bucket]');
  for(var j=0;j<zones.length;j++){
    (function(zone){
      zone.addEventListener('dragover',function(e){ e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave',function(){ zone.classList.remove('drag-over'); });
      zone.addEventListener('drop',function(e){
        e.preventDefault(); zone.classList.remove('drag-over');
        var id=Number(e.dataTransfer.getData('text/plain'));
        var targetBucket=zone.getAttribute('data-drop-bucket');
        var targetIndex=zone.querySelectorAll('.appointment-block').length;
        onDropAppointment(id,targetBucket,targetIndex);
      });
    })(zones[j]);
  }
}
function bucketOf(a){ return (a.date && a.period) ? (a.date+'|'+a.period) : 'unscheduled'; }
function normalizeBucketOrder(bucket){
  var items=appointments.filter(function(a){ return bucketOf(a)===bucket; });
  for(var i=0;i<items.length;i++){ items[i].sortIndex=i+1; }
}
function onDropAppointment(id,targetBucket,targetIndex){
  var i=-1; for(var k=0;k<appointments.length;k++){ if(appointments[k].id==id){ i=k; break; } }
  if(i<0) return;
  var a=appointments[i];
  var prev={date:a.date,period:a.period,sortIndex:a.sortIndex};

  if(targetBucket==='unscheduled'){ a.date=''; a.period=''; }
  else { var parts=targetBucket.split('|'); a.date=parts[0]; a.period=parts[1]||a.period||'Manhã'; }

  normalizeBucketOrder(targetBucket);
  var list=appointments.filter(function(x){ return bucketOf(x)===targetBucket; }).sort(function(x,y){ return (x.sortIndex||0)-(y.sortIndex||0); });
  for(var t=0;t<list.length;t++){ list[t].sortIndex=t+1; }
  if(targetIndex>=list.length) a.sortIndex=list.length+1;
  else {
    list.splice(targetIndex,0,a);
    for(var u=0;u<list.length;u++){ list[u].sortIndex=u+1; }
  }

  renderAll(); // otimista

  apiPut('/api/appointments/'+id,a).then(function(updated){
    if(updated && typeof updated==='object'){ for(var k=0;k<appointments.length;k++){ if(appointments[k].id==id){ for(var p in updated){ appointments[k][p]=updated[p]; } } } }
    return load().then(renderAll).then(function(){ showToast('Agendamento movido!','success'); });
  }).catch(function(e){
    a.date=prev.date; a.period=prev.period; a.sortIndex=prev.sortIndex; renderAll();
    showToast('Erro a gravar movimento: '+e.message,'error');
  });
}

/* ===========================
   RENDER
=========================== */
function renderSchedule(){
  var table=$('schedule'); if(!table) return; table.innerHTML='';

  // Segunda → Sábado
  var week=[]; for(var i=0;i<6;i++) week.push(addDays(currentMonday,i));
  var wr=$('weekRange');
  if(wr){ wr.textContent = week[0].toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit'})+' - '+week[5].toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric'}); }

  var thead='<thead><tr><th>Período</th>';
  for(var d=0; d<week.length; d++){ var h=fmtHeader(week[d]); thead+='<th><div class="day">'+cap(h.day)+'</div><div class="date">'+h.dm+'</div></th>'; }
  thead+='</tr></thead>';
  table.insertAdjacentHTML('beforeend',thead);

  function renderCell(period,dayDate){
    var iso=localISO(dayDate);
    var items=filterAppointments(
      appointments.filter(function(a){ return a.date && a.date===iso && a.period===period; })
                  .sort(function(x,y){ return (x.sortIndex||0)-(y.sortIndex||0); })
    );
    var html='';
    for(var i=0;i<items.length;i++){
      var a=items[i];
      html += '<div class="appointment-block status-'+a.status+'" data-id="'+a.id+'" draggable="true">'+
                '<div class="appt-header"><strong>'+(a.plate||'')+'</strong> | '+(a.service||'')+' | '+(String(a.car||'').toUpperCase())+'</div>'+
                '<div class="appt-sub">'+(a.notes||'')+'</div>'+
                '<div class="appt-status">'+
                  '<label><input type="checkbox" data-status="NE" '+(a.status==='NE'?'checked':'')+'> N/E</label>'+
                  '<label><input type="checkbox" data-status="VE" '+(a.status==='VE'?'checked':'')+'> V/E</label>'+
                  '<label><input type="checkbox" data-status="ST" '+(a.status==='ST'?'checked':'')+'> ST</label>'+
                '</div>'+
                '<div class="card-actions">'+
                  '<button class="action" type="button" title="Editar" onclick="editAppointment('+a.id+')">✏️</button>'+
                  '<button class="action" type="button" title="Apagar" onclick="deleteAppointment('+a.id+')">🗑️</button>'+
                '</div>'+
              '</div>';
    }
    return '<div class="drop-zone" data-drop-bucket="'+iso+'|'+period+'">'+html+'</div>';
  }

  var tbody=document.createElement('tbody');
  var periods=['Manhã','Tarde'];
  for(var r=0;r<periods.length;r++){
    var row=document.createElement('tr');
    var cells='<th>'+periods[r]+'</th>';
    for(var c=0;c<week.length;c++){ cells+='<td>'+renderCell(periods[r],week[c])+'</td>'; }
    row.innerHTML=cells;
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  enableDragDrop();
  attachStatusListeners();
  wireStatePills(table);
  highlightSearchResults();
}

/* Unscheduled */
function renderUnscheduled(){
  var container=$('unscheduledList'); if(!container) return;

  var uns=filterAppointments(
    appointments.filter(function(a){ return !a.date || !a.period; })
                .sort(function(x,y){ return (x.sortIndex||0)-(y.sortIndex||0); })
  );

  if (uns.length === 0){
    container.innerHTML =
      '<div class="drop-zone empty" data-drop-bucket="unscheduled">'+
         '<div class="unscheduled-empty-msg">Sem serviços por agendar.<small> Arrasta para aqui a partir do calendário, ou clica em “+ Novo Serviço”.</small></div>'+
      '</div>';
    enableDragDrop(container);
    return;
  }

  var blocks='';
  for(var i=0;i<uns.length;i++){
    var a=uns[i];
    blocks += '<div class="appointment-block status-'+a.status+'" data-id="'+a.id+'" draggable="true">'+
                '<div class="appt-header"><strong>'+(a.plate||'')+'</strong> | '+(a.service||'')+' | '+(String(a.car||'').toUpperCase())+'</div>'+
                '<div class="appt-sub">'+(a.notes||'')+'</div>'+
                '<div class="appt-status">'+
                  '<label><input type="checkbox" data-status="NE" '+(a.status==='NE'?'checked':'')+'> N/E</label>'+
                  '<label><input type="checkbox" data-status="VE" '+(a.status==='VE'?'checked':'')+'> V/E</label>'+
                  '<label><input type="checkbox" data-status="ST" '+(a.status==='ST'?'checked':'')+'> ST</label>'+
                '</div>'+
                '<div class="card-actions">'+
                  '<button class="action" type="button" title="Editar" onclick="editAppointment('+a.id+')">✏️</button>'+
                  '<button class="action" type="button" title="Apagar" onclick="deleteAppointment('+a.id+')">🗑️</button>'+
                '</div>'+
              '</div>';
  }
  container.innerHTML = '<div class="drop-zone" data-drop-bucket="unscheduled">'+blocks+'</div>';
  enableDragDrop(container);
  attachStatusListeners();
  wireStatePills(container);
  highlightSearchResults();
}

function renderMobileDay(){
  var label=$('mobileDayLabel');
  if(label){
    var s=currentMobileDay.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
    label.textContent=cap(s);
  }
  var iso=localISO(currentMobileDay);
  var dayItems=filterAppointments(
    appointments.filter(function(a){ return a.date===iso; })
                .sort(function(a,b){
                  if(a.period!==b.period) return a.period==='Manhã'?-1:1;
                  return (a.sortIndex||0)-(b.sortIndex||0);
                })
  );
  var container=$('mobileDayList'); if(!container) return;
  var html='';
  for(var i=0;i<dayItems.length;i++){
    var a=dayItems[i];
    html += '<div class="appointment-block status-'+a.status+'" style="margin-bottom:10px;" data-id="'+a.id+'">'+
              '<div class="appt-header">'+a.period+' - '+(a.plate||'')+' | '+(a.service||'')+' | '+(String(a.car||'').toUpperCase())+'</div>'+
              '<div class="appt-sub">'+(a.notes||'')+'</div>'+
            '</div>';
  }
  container.innerHTML = html;
  wireStatePills(container);
  highlightSearchResults();
}

function renderServicesTable(){
  var tbody=$('servicesTableBody'); if(!tbody) return;
  var today=new Date();
  var future=filterAppointments(
    appointments.filter(function(a){ return a.date && new Date(a.date)>=new Date().setHours(0,0,0,0); })
                .sort(function(a,b){ return new Date(a.date)-new Date(b.date); })
  );
  var rows='';
  for(var i=0;i<future.length;i++){
    var a=future[i]; var dt=new Date(a.date);
    var diff=Math.ceil((dt-today)/(1000*60*60*24));
    var daysText = diff<0?(Math.abs(diff)+' dias atrás') : (diff===0?'Hoje' : (diff===1?'Amanhã' : (diff+' dias')));
    rows += '<tr>'+
      '<td>'+dt.toLocaleDateString('pt-PT')+'</td>'+
      '<td>'+(a.period||'')+'</td>'+
      '<td>'+(a.plate||'')+'</td>'+
      '<td>'+(a.car||'')+'</td>'+
      '<td><span class="badge badge-'+(a.service||'')+'">'+(a.service||'')+'</span></td>'+
      '<td>'+(a.notes||'')+'</td>'+
      '<td>'+(a.status||'')+'</td>'+
      '<td>'+daysText+'</td>'+
      '<td class="no-print">'+
        '<button class="table-btn" type="button" onclick="editAppointment('+a.id+')">✏️</button>'+
        '<button class="table-btn danger" type="button" onclick="deleteAppointment('+a.id+')">🗑️</button>'+
      '</td>'+
    '</tr>';
  }
  tbody.innerHTML = rows;
  var sum=$('servicesSummary'); if(sum) sum.textContent = future.length+' serviços pendentes';
}

function renderAll(){
  try{
    renderSchedule();
    renderUnscheduled();
    renderMobileDay();
    renderServicesTable();
  }catch(err){
    console.error(err);
    showToast('Erro a desenhar o ecrã.','error');
  }
}

/* ===========================
   CRUD
=========================== */
function openAppointmentModal(id){
  id = id || null;
  var modal=$('appointmentModal'); if(!modal){ showToast('Modal não encontrado.','error'); return; }
  editingId=id;
  var form=$('appointmentForm');
  var title=$('modalTitle');
  var del=$('deleteAppointment');

  if(id){
    var a=null; for(var k=0;k<appointments.length;k++){ if(appointments[k].id==id){ a=appointments[k]; break; } }
    if(a){
      if(title) title.textContent='Editar Agendamento';
      if($('appointmentDate')) $('appointmentDate').value   = formatDateForInput(a.date)||'';
      if($('appointmentPeriod')) $('appointmentPeriod').value = a.period||'';
      if($('appointmentPlate')) $('appointmentPlate').value  = a.plate||'';
      if($('appointmentCar')) $('appointmentCar').value    = a.car||'';
      if($('appointmentService')) $('appointmentService').value= a.service||'';
      if($('appointmentStatus')) $('appointmentStatus').value = a.status||'NE';
      if($('appointmentNotes')) $('appointmentNotes').value  = a.notes||'';
      if($('appointmentExtra')) $('appointmentExtra').value  = a.extra||'';
      if(del) del.classList.remove('hidden');
    }
  }else{
    if(title) title.textContent='Novo Agendamento';
    if(form) form.reset();
    if($('appointmentStatus')) $('appointmentStatus').value='NE';
    if(del) del.classList.add('hidden');
  }
  modal.classList.add('show');
}
function closeAppointmentModal(){ var m=$('appointmentModal'); if(m) m.classList.remove('show'); editingId=null; }

function saveAppointment(){
  var rawDate=$('appointmentDate') ? $('appointmentDate').value : '';
  var appointment={
    id: editingId || (Date.now()+Math.random()),
    date: parseDate(rawDate),
    period: normalizePeriod($('appointmentPeriod') ? $('appointmentPeriod').value : ''),
    plate: ( $('appointmentPlate') ? $('appointmentPlate').value : '' ).toUpperCase(),
    car:   $('appointmentCar') ? $('appointmentCar').value : '',
    service: $('appointmentService') ? $('appointmentService').value : '',
    status:  $('appointmentStatus') ? $('appointmentStatus').value : 'NE',
    notes:   $('appointmentNotes') ? $('appointmentNotes').value : '',
    extra:   $('appointmentExtra') ? $('appointmentExtra').value : '',
    sortIndex: 1
  };
  if(!appointment.plate || !appointment.car || !appointment.service){
    showToast('Preenche Matrícula, Carro e Serviço.','error'); return;
  }
  var promise;
  if(editingId){
    promise = apiPut('/api/appointments/'+editingId, appointment).then(function(result){
      var idx=-1; for(var i=0;i<appointments.length;i++){ if(appointments[i].id==editingId){ idx=i; break; } }
      if(idx>=0) appointments[idx]=Object.assign({}, appointments[idx], result || appointment);
      showToast('Agendamento atualizado!','success');
    });
  }else{
    promise = apiPost('/api/appointments', appointment).then(function(created){
      appointments.push(created || appointment);
      showToast('Agendamento criado!','success');
    });
  }
  promise.then(function(){ return load(); })
         .then(function(){ renderAll(); closeAppointmentModal(); })
         .catch(function(e){ console.error(e); showToast('Erro ao guardar: '+e.message,'error'); });
}
function editAppointment(id){ openAppointmentModal(id); }
function deleteAppointment(id){
  if(!confirm('Eliminar este agendamento?')) return;
  apiDelete('/api/appointments/'+id).then(function(){
    return load().then(function(){ renderAll(); showToast('Eliminado!','success'); if(editingId==id) closeAppointmentModal(); });
  }).catch(function(e){ console.error(e); showToast('Erro ao eliminar: '+e.message,'error'); });
}

/* Expor para onclick inline */
window.openAppointmentModal = openAppointmentModal;
window.editAppointment = editAppointment;
window.deleteAppointment = deleteAppointment;

/* ===========================
   STATUS (checkboxes)
=========================== */
function attachStatusListeners(){
  var cbs=document.querySelectorAll('.appt-status input[type="checkbox"]');
  for(var i=0;i<cbs.length;i++){
    cbs[i].addEventListener('change', function(){
      var self=this;
      var card=self.closest('.appointment-block');
      var id=Number(card.getAttribute('data-id'));
      var st=self.getAttribute('data-status');

      // exclusivo
      var siblings=card.querySelectorAll('.appt-status input[type="checkbox"]');
      for(var j=0;j<siblings.length;j++){ if(siblings[j]!==self) siblings[j].checked=false; }

      // otimista
      var a=null; for(var k=0;k<appointments.length;k++){ if(appointments[k].id==id){ a=appointments[k]; break; } }
      if(!a) return;
      var prevStatus=a.status; var prevFilter=statusFilter;
      a.status=st;
      if(statusFilter && a.status!==statusFilter){ statusFilter=''; var sel=$('filterStatus'); if(sel) sel.value=''; }
      wireStatePills(card);

      apiPut('/api/appointments/'+id, a).then(function(updated){
        if(updated && typeof updated==='object'){ for(var p in updated){ a[p]=updated[p]; } }
        return load().then(function(){ renderAll(); showToast('Status gravado: '+st,'success'); });
      }).catch(function(e){
        a.status=prevStatus;
        if(prevFilter){ statusFilter=prevFilter; var s=$('filterStatus'); if(s) s.value=prevFilter; }
        return load().then(function(){ renderAll(); showToast('Erro a gravar status: '+e.message,'error'); });
      });
    });
  }
}

/* ===========================
   PRINT helpers
=========================== */
function updatePrintUnscheduledTable(){
  var uns=filterAppointments(appointments.filter(function(a){ return !a.date || !a.period; })
    .sort(function(x,y){ return (x.sortIndex||0)-(y.sortIndex||0); }));
  var tbody=$('printUnscheduledTableBody'); if(!tbody) return;
  var sec=document.querySelector('.print-unscheduled-section'); if(uns.length===0){ if(sec) sec.style.display='none'; return; } if(sec) sec.style.display='';
  var html='';
  for(var i=0;i<uns.length;i++){
    var a=uns[i];
    html+='<tr><td>'+(a.plate||'')+'</td><td>'+(a.car||'')+'</td><td>'+(a.service||'')+'</td><td>'+(a.status||'')+'</td><td>'+(a.notes||'')+'</td><td>'+(a.extra||'')+'</td></tr>';
  }
  tbody.innerHTML=html;
}
function updatePrintTomorrowTable(){
  var title=$('printTomorrowTitle');
  var dateEl=$('printTomorrowDate');
  var tbody=$('printTomorrowTableBody');
  var empty=$('printTomorrowEmpty'); if(!tbody) return;
  var tomorrow=addDays(new Date(),1); var iso=localISO(tomorrow);
  if(title) title.textContent='SERVIÇOS DE AMANHÃ';
  if(dateEl) dateEl.textContent=tomorrow.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
  var rows=appointments.filter(function(a){ return a.date===iso; })
    .sort(function(a,b){ if(a.period!==b.period) return a.period==='Manhã'?-1:1; return (a.sortIndex||0)-(b.sortIndex||0); });
  if(rows.length===0){ if(empty) empty.style.display='block'; tbody.innerHTML=''; return; }
  if(empty) empty.style.display='none';
  var html='';
  for(var i=0;i<rows.length;i++){
    var a=rows[i];
    html+='<tr><td>'+(a.period||'')+'</td><td>'+(a.plate||'')+'</td><td>'+(a.car||'')+'</td><td>'+(a.service||'')+'</td><td>'+(a.status||'')+'</td><td>'+(a.notes||'')+'</td><td>'+(a.extra||'')+'</td></tr>';
  }
  tbody.innerHTML=html;
}

/* ===========================
   BOOT
=========================== */
document.addEventListener('DOMContentLoaded', function(){
  // Semana
  var prevWeekBtn=$('prevWeek'); if(prevWeekBtn) prevWeekBtn.addEventListener('click', function(){ currentMonday=addDays(currentMonday,-7); renderAll(); });
  var nextWeekBtn=$('nextWeek'); if(nextWeekBtn) nextWeekBtn.addEventListener('click', function(){ currentMonday=addDays(currentMonday, 7); renderAll(); });
  var todayWeekBtn=$('todayWeek'); if(todayWeekBtn) todayWeekBtn.addEventListener('click', function(){ currentMonday=getMonday(new Date()); renderAll(); });

  // Mobile day
  var prevDay=$('prevDay'); if(prevDay) prevDay.addEventListener('click', function(){ currentMobileDay=addDays(currentMobileDay,-1); renderMobileDay(); });
  var todayDay=$('todayDay'); if(todayDay) todayDay.addEventListener('click', function(){ currentMobileDay=new Date(); renderMobileDay(); });
  var nextDay=$('nextDay'); if(nextDay) nextDay.addEventListener('click', function(){ currentMobileDay=addDays(currentMobileDay,1); renderMobileDay(); });

  // Impressão
  var printBtn=$('printPage'); if(printBtn) printBtn.addEventListener('click', function(){ updatePrintUnscheduledTable(); updatePrintTomorrowTable(); window.print(); });

  // Pesquisa
  var searchBtn=$('searchBtn'); if(searchBtn) searchBtn.addEventListener('click', function(){ var sb=$('searchBar'); if(sb){ sb.classList.toggle('hidden'); var i=$('searchInput'); if(i) i.focus(); }});
  var searchInput=$('searchInput'); if(searchInput) searchInput.addEventListener('input', function(e){ searchQuery=e.target.value||''; renderAll(); });
  var clearSearch=$('clearSearch'); if(clearSearch) clearSearch.addEventListener('click', function(){ var i=$('searchInput'); if(i) i.value=''; searchQuery=''; renderAll(); });

  // Filtro estado
  var filterSel=$('filterStatus'); if(filterSel) filterSel.addEventListener('change', function(e){ statusFilter=e.target.value||''; renderAll(); });

  // Modal & form
  var closeModal=$('closeModal'); if(closeModal) closeModal.addEventListener('click', closeAppointmentModal);
  var cancelForm=$('cancelForm'); if(cancelForm) cancelForm.addEventListener('click', closeAppointmentModal);
  var form=$('appointmentForm'); if(form) form.addEventListener('submit', function(e){ e.preventDefault(); saveAppointment(); });
  var delBtn=$('deleteAppointment'); if(delBtn) delBtn.addEventListener('click', function(){ if(editingId) deleteAppointment(editingId); });

  // Backup/Stats (stubs)
  var backupBtn=$('backupBtn'); if(backupBtn) backupBtn.addEventListener('click', function(){ var m=$('backupModal'); if(m) m.classList.add('show'); });
  var statsBtn=$('statsBtn'); if(statsBtn) statsBtn.addEventListener('click', function(){ var m=$('statsModal'); if(m) m.classList.add('show'); });

  load().then(renderAll);
});

/* ===========================
   PILLs dos estados (NE / VE / ST)
   — aplica classes: .ne (vermelho), .ve (amarelo), .st (verde)
=========================== */
function wireStatePills(root) {
  root = root || document;
  var boxes = root.querySelectorAll('#schedule input[type="checkbox"], #unscheduledList input[type="checkbox"]');
  for(var i=0;i<boxes.length;i++){
    (function(cb){
      var pill = cb.closest ? (cb.closest('label') || cb.parentElement) : cb.parentElement;
      if (!pill) return;
      pill.classList.add('state-pill');
      cb.classList.add('state-box');
      var code = (cb.getAttribute('data-status') || cb.value || '').toUpperCase();
      pill.classList.remove('ne','ve','st');
      if (code === 'NE') pill.classList.add('ne');
      if (code === 'VE') pill.classList.add('ve');
      if (code === 'ST') pill.classList.add('st');
      pill.classList.toggle('is-checked', cb.checked);
      cb.addEventListener('change', function(){ pill.classList.toggle('is-checked', cb.checked); });
    })(boxes[i]);
  }
}
/* ===========================
   ⚠️ Overrides finais — Estado VE a AMARELO
   =========================== */

/* 1) PILLs de estado (N/E, V/E, ST) */
.appt-status label.state-pill {               /* base */
  display:inline-flex; align-items:center; gap:8px;
  padding:6px 12px; border-radius:999px; border:1px solid transparent;
  font-weight:600; line-height:1; user-select:none;
}

/* Não selecionadas (tons suaves) */
.appt-status label.state-pill.ne { background:#FEE2E2; border-color:#FECACA; color:#7F1D1D; }
.appt-status label.state-pill.ve { background:#FEF3C7; border-color:#FDE68A; color:#7C2D12; } /* AMARELO */
.appt-status label.state-pill.st { background:#DCFCE7; border-color:#BBF7D0; color:#064E3B; }

/* Selecionadas (forte) */
.appt-status label.state-pill.ne.is-checked { background:#EF4444; border-color:#DC2626; color:#fff; }
.appt-status label.state-pill.ve.is-checked { background:#F59E0B; border-color:#D97706; color:#111; } /* AMARELO */
.appt-status label.state-pill.st.is-checked { background:#10B981; border-color:#059669; color:#fff; }

/* Checkbox estilizado com visto preto (fica sempre visível) */
.appt-status .state-box{
  appearance:none; -webkit-appearance:none; width:18px; height:18px;
  border:2px solid rgba(0,0,0,.25); border-radius:6px; background:#fff; position:relative;
}
.appt-status .state-box:checked::after{
  content:""; position:absolute; left:3px; top:2px; right:3px; bottom:3px;
  background:#111;                /* visto preto */
  -webkit-mask:polygon(14% 44%,0 60%,38% 100%,100% 27%,84% 12%,38% 62%);
  mask:polygon(14% 44%,0 60%,38% 100%,100% 27%,84% 12%,38% 62%);
}

/* 2) Cartões conforme o estado (gradiente + contraste) */
.appointment-block.status-NE{
  background:linear-gradient(180deg,#ef4444,#dc2626) !important;
  color:#fff;
}
.appointment-block.status-VE{
  background:linear-gradient(180deg,#fbbf24,#f59e0b) !important; /* AMARELO */
  color:#111;  /* contraste escuro */
}
.appointment-block.status-ST{
  background:linear-gradient(180deg,#10b981,#059669) !important;
  color:#fff;
}

/* Para garantir que o título do cartão mantém contraste no VE */
.appointment-block.status-VE .appt-header strong { color:#111; }
.appointment-block.status-VE .appt-sub { color:#222; }