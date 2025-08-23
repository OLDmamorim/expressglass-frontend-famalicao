/* ===========================================
   script.js — alinhado ao teu index.html
   =========================================== */
(() => {
  'use strict';

  // ===== API (usa /api em produção; localhost com Netlify Dev) =====
  const API_BASE = location.hostname.includes('localhost') ? 'http://localhost:8888/api' : '/api';
  const API = `${API_BASE}/appointments`;
  const IS_MOBILE = () => matchMedia('(max-width: 820px)').matches;

  // ===== Estado =====
  const state = {
    weekStart: startOfWeek(new Date()),
    selectedDay: new Date(),
    appointments: [],
    filter: ''
  };

  // ===== Arranque =====
  document.addEventListener('DOMContentLoaded', () => {
    bindWeekNav();      // #prevWeek #nextWeek #todayWeek
    bindDayNav();       // #prevDay #nextDay #todayDay
    bindSearch();       // #searchBtn #searchBar #searchInput #clearSearch
    bindPrint();        // #printPage
    loadAndRenderWeek(state.weekStart);
  });

  // ===== Ligações de UI =====
  function bindWeekNav(){
    id('prevWeek')?.addEventListener('click', () => { shiftWeek(-1); });
    id('nextWeek')?.addEventListener('click', () => { shiftWeek(+1); });
    id('todayWeek')?.addEventListener('click', () => { goToTodayWeek(); });
  }
  function bindDayNav(){
    id('prevDay')?.addEventListener('click', () => navigateDay(-1));
    id('nextDay')?.addEventListener('click', () => navigateDay(+1));
    id('todayDay')?.addEventListener('click', () => setSelectedDay(new Date(), true));
    // Swipe no telemóvel
    const area = qs('#mobileDayView');
    if (area){
      let x0=null,y0=null,t0=0;
      area.addEventListener('touchstart', ev => { const t=ev.changedTouches[0]; x0=t.clientX; y0=t.clientY; t0=Date.now(); }, {passive:true});
      area.addEventListener('touchend', ev => {
        if (x0==null) return;
        const t=ev.changedTouches[0], dx=t.clientX-x0, dy=t.clientY-y0, dt=Date.now()-t0;
        x0=y0=null;
        if (Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy) && dt<600){
          if (dx<0) navigateDay(+1); else navigateDay(-1);
        }
      }, {passive:true});
    }
  }
  function bindSearch(){
    id('searchBtn')?.addEventListener('click', () => {
      id('searchBar')?.classList.toggle('hidden');
      id('searchInput')?.focus();
    });
    id('searchInput')?.addEventListener('input', debounce(() => {
      state.filter = (id('searchInput').value || '').trim().toLowerCase();
      renderAll();
    }, 150));
    id('clearSearch')?.addEventListener('click', () => {
      if (id('searchInput')) id('searchInput').value = '';
      state.filter = '';
      renderAll();
    });
  }
  function bindPrint(){ id('printPage')?.addEventListener('click', () => window.print()); }

  // ===== API =====
  async function apiListWeek(weekStart, weekEnd){
    const params = new URLSearchParams({ weekStart: toISODate(weekStart), weekEnd: toISODate(weekEnd) });
    try {
      const res = await fetch(`${API}?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text().catch(()=> ''));
      const data = await res.json().catch(()=> ({}));
      return data.appointments ?? data ?? [];
    } catch (e){
      // MOCK para poderes navegar mesmo sem backend
      console.warn('API falhou, a usar mock para testar navegação.', e?.message || e);
      const b = startOfWeek(weekStart);
      return [
        { id:'m1', date: toISODate(b),           period:'AM', status:'NE', plate:'AA-11-BB', car:'Astra', serviceType:'PB', store:'Guimarães' },
        { id:'m2', date: toISODate(addDays(b,1)), period:'PM', status:'VE', plate:'CC-22-DD', car:'Focus', serviceType:'LT', store:'Famalicão' },
        { id:'m3', date: toISODate(addDays(b,3)), period:'AM', status:'ST', plate:'EE-33-FF', car:'Golf',  serviceType:'OC', store:'Braga' },
      ];
    }
  }

  // ===== Load & Render =====
  async function loadAndRenderWeek(weekStart){
    const weekEnd = addDays(weekStart, 6);
    updateWeekRangeLabel(weekStart, weekEnd);        // #weekRange
    state.selectedDay = clampToWeek(state.selectedDay, weekStart) || weekStart;

    try{
      state.appointments = await apiListWeek(weekStart, weekEnd);
    } catch {}
    renderAll();
  }

  function renderAll(){
    renderSchedule();                       // <table id="schedule" class="schedule">
    renderUnscheduled();                    // #unscheduledList
    renderServicesTable();                  // #servicesTableBody
    renderMobileDay(state.selectedDay);     // #mobileDayLabel, #mobileDayList
  }

  // ===== Calendário semanal (desktop) =====
  function renderSchedule(){
    const table = id('schedule');
    if (!table) return;
    table.classList.add('schedule');
    ensureScheduleSkeleton(table);

    const tbody = table.tBodies[0];
    [...tbody.querySelectorAll('td')].forEach(td => td.innerHTML='');

    const map = groupByDayPeriod(filteredAppointments());
    const days = weekDays(state.weekStart);
    ['AM','PM'].forEach((period, rowIdx) => {
      days.forEach((d, colIdx) => {
        const td = tbody.rows[rowIdx]?.cells[colIdx+1]; if (!td) return;
        (map.get(`${toISODate(d)}|${period}`) || []).forEach(appt => td.appendChild(makeCard(appt)));
      });
    });
  }

  function ensureScheduleSkeleton(table){
    // thead
    if (!table.tHead){
      const thead = table.createTHead(); const tr = thead.insertRow();
      const th0 = document.createElement('th'); th0.textContent = ''; tr.appendChild(th0);
      weekDays(state.weekStart).forEach(d => {
        const th = document.createElement('th');
        th.innerHTML = `<div class="day">${wdPT(d)}</div><div class="date">${ddmm(d)}</div>`;
        tr.appendChild(th);
      });
    } else {
      const ths = table.tHead.rows[0]?.cells;
      const days = weekDays(state.weekStart);
      if (ths && ths.length === 8){
        days.forEach((d,i)=> ths[i+1].innerHTML = `<div class="day">${wdPT(d)}</div><div class="date">${ddmm(d)}</div>`);
      }
    }
    // tbody
    if (!table.tBodies[0]){
      const tbody = table.createTBody();
      ['Manhã','Tarde'].forEach(label => {
        const tr = tbody.insertRow();
        const th = document.createElement('th'); th.textContent = label; tr.appendChild(th);
        for (let i=0;i<7;i++){ tr.appendChild(document.createElement('td')); }
      });
    }
  }

  // ===== Unscheduled (desktop) =====
  function renderUnscheduled(){
    const listEl = id('unscheduledList'); if (!listEl) return;
    listEl.innerHTML = '';
    filteredAppointments().filter(a => !a.date).forEach(a => listEl.appendChild(makeCard(a, true)));
    if (!listEl.children.length){
      const dz = document.createElement('div');
      dz.className = 'drop-zone empty';
      dz.innerHTML = `<div class="unscheduled-empty-msg">Sem serviços por agendar.<br><small>Usa "+ Novo Serviço".</small></div>`;
      listEl.appendChild(dz);
    }
  }

  // ===== Services Table (desktop) =====
  function renderServicesTable(){
    const tbody = id('servicesTableBody'); if (!tbody) return;
    tbody.innerHTML = '';
    filteredAppointments().filter(a => a.date).forEach(a => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ddmm(parseISO(a.date))}</td>
        <td>${a.period==='AM'?'Manhã':a.period==='PM'?'Tarde':''}</td>
        <td>${esc(a.plate||'')}</td>
        <td>${esc(a.car||'')}</td>
        <td>${esc(a.serviceType||'')}</td>
        <td>${esc(a.notes||'')}</td>
        <td>${esc((a.status||'NE').toUpperCase())}</td>
        <td></td>
        <td class="no-print"></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ===== Vista diária (mobile) =====
  function renderMobileDay(date){
    const label = id('mobileDayLabel');
    const list  = id('mobileDayList');
    if (!label || !list) return;

    label.textContent = `${wdPT(date)} • ${ddmm(date)}`;
    list.innerHTML = '';

    const items = filteredAppointments()
      .filter(a => a.date === toISODate(date))
      .sort((a,b) => (a.period||'').localeCompare(b.period||''));

    if (!items.length){
      const empty = document.createElement('div');
      empty.className = 'appt-sub';
      empty.style.cssText = 'text-align:center;opacity:.7';
      empty.textContent = 'Sem serviços para este dia.';
      list.appendChild(empty);
      return;
    }
    items.forEach(a => list.appendChild(makeCard(a)));
  }

  // ===== Cartão de agendamento =====
  function makeCard(appt, unscheduled=false){
    const card = document.createElement('div');
    card.className = 'appointment' + (unscheduled ? ' unscheduled' : '');
    card.dataset.id = appt.id ?? '';
    card.dataset.status = (appt.status || 'NE').toUpperCase();

    const h = document.createElement('div');
    h.className = 'appt-header';
    h.textContent = [appt.plate, appt.store].filter(Boolean).join(' • ');
    card.appendChild(h);

    const sub = document.createElement('div');
    sub.className = 'appt-sub';
    sub.textContent = [appt.car, appt.serviceType ? `(${appt.serviceType})` : '', appt.period ? (appt.period==='AM'?'Manhã':'Tarde') : '']
      .filter(Boolean).join(' ');
    card.appendChild(sub);

    const chip = document.createElement('span');
    chip.className = 'chip ' + chipClass(appt.status);
    chip.textContent = (appt.status || 'NE').toUpperCase();
    card.appendChild(chip);

    // Pinta no mobile pela cor do estado
    if (IS_MOBILE()){
      card.classList.remove('card-NE','card-VE','card-ST');
      const s = (appt.status||'NE').toUpperCase();
      if (s==='NE') card.classList.add('card-NE');
      if (s==='VE') card.classList.add('card-VE');
      if (s==='ST') card.classList.add('card-ST');
    }
    return card;
  }

  function chipClass(s){ s=(s||'NE').toUpperCase(); return s==='VE'?'chip-VE':s==='ST'?'chip-ST':'chip-NE'; }

  // ===== Navegação (semana/dia) =====
  function shiftWeek(delta){
    state.weekStart = addDays(state.weekStart, delta*7);
    state.selectedDay = clampToWeek(state.selectedDay, state.weekStart) || state.weekStart;
    loadAndRenderWeek(state.weekStart);
  }
  function goToTodayWeek(){
    state.weekStart = startOfWeek(new Date());
    state.selectedDay = new Date();
    loadAndRenderWeek(state.weekStart);
  }
  function navigateDay(delta){
    const target = addDays(state.selectedDay, delta);
    const wkStartTarget = startOfWeek(target);
    if (wkStartTarget.getTime() !== state.weekStart.getTime()){
      state.weekStart = wkStartTarget;
      state.selectedDay = target;
      loadAndRenderWeek(state.weekStart);
    } else {
      setSelectedDay(target, false);
    }
  }
  function setSelectedDay(date, canShiftWeek){
    if (canShiftWeek){
      const wk = startOfWeek(date);
      if (wk.getTime() !== state.weekStart.getTime()){
        state.weekStart = wk; state.selectedDay = date; return loadAndRenderWeek(state.weekStart);
      }
    }
    state.selectedDay = date;
    renderMobileDay(state.selectedDay);
  }

  // ===== Filtro =====
  function filteredAppointments(){
    const f = state.filter; if (!f) return state.appointments;
    return state.appointments.filter(a => {
      const hay = [a.plate,a.car,a.serviceType,a.store,a.notes,a.status,a.period,a.date]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(f);
    });
  }
  function groupByDayPeriod(list){
    const map = new Map();
    list.forEach(a => {
      if (!a.date) return;
      const key = `${a.date}|${(a.period||'AM').toUpperCase()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    });
    return map;
  }

  // ===== UI helpers =====
  function updateWeekRangeLabel(start, end){
    const el = id('weekRange'); if (!el) return;
    const sameMonth = start.getMonth() === end.getMonth();
    el.textContent = sameMonth
      ? `${pad2(start.getDate())}–${pad2(end.getDate())} ${monthPT(start)} ${start.getFullYear()}`
      : `${pad2(start.getDate())} ${monthPT(start)} – ${pad2(end.getDate())} ${monthPT(end)} ${start.getFullYear()}`;
  }

  // ===== Util datas =====
  function startOfWeek(d){ const x=new Date(d.getFullYear(),d.getMonth(),d.getDate()); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return x; }
  function weekDays(ws){ return Array.from({length:7},(_,i)=>addDays(ws,i)); }
  function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function toISODate(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  function parseISO(s){ const [y,m,dd]=String(s||'').split('-').map(Number); return new Date(y,(m||1)-1,dd||1); }
  function ddmm(d){ return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`; }
  function wdPT(d){ return ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][(d.getDay()+6)%7]; }
  function monthPT(d){ return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][d.getMonth()]; }
  function pad2(n){ return String(n).padStart(2,'0'); }

  // ===== Util DOM =====
  function id(s){ return document.getElementById(s); }
  function qs(s, r=document){ return r.querySelector(s); }
  function esc(s){ return String(s ?? '').replace(/[&<>"'`=\/]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[c])); }
  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

})();