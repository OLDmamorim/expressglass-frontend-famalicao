/* ===========================================
   script.js — Modo seguro (navegação + debug embutido)
   =========================================== */
(() => {
  'use strict';

  // ====== CONFIG ======
  const API_BASE = location.hostname.includes('localhost') ? 'http://localhost:8888/api' : '/api';
  const API = `${API_BASE}/appointments`;
  const MOBILE_QUERY = '(max-width: 820px)';

  // ====== DESBLOQUEIO DE CLIQUES (se CSS tiver pointer-events:none) ======
  (function forceClicksOn(){
    const s = document.createElement('style');
    s.textContent = `
      body.loading { opacity:.6; }
      /* garantir que nada bloqueia cliques durante debug */
      body.eg-force * { pointer-events: auto !important; }
      #eg-debug{ position:fixed; inset:auto 10px 10px auto; z-index:99999;
        background:#0b1220; color:#fff; border:1px solid #1f2a44; border-radius:10px;
        padding:10px; font:12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        box-shadow:0 6px 18px rgba(0,0,0,.25) }
      #eg-debug h4{ margin:0 0 6px; font-size:12px; letter-spacing:.3px; opacity:.9 }
      #eg-debug .row{ display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px }
      #eg-debug button{ border:0; padding:6px 8px; border-radius:6px; cursor:pointer; background:#1f2a44; color:#fff }
      #eg-debug .muted{opacity:.7}
      #eg-debug .pill{ padding:2px 6px; background:#1f2a44; border-radius:999px; font-weight:600 }
    `;
    document.head.appendChild(s);
    document.documentElement.classList.add('eg-force');
  })();

  // ====== ESTADO ======
  const state = {
    weekStart: startOfWeek(new Date()),
    selectedDay: new Date(),
    appointments: [],
    filter: ''
  };

  // ====== ARRANQUE ======
  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', () => setTimeout(() => document.body.classList.remove('loading'), 800));

  function init(){
    // Garante containers mínimos (se faltarem no HTML)
    ensureMinimalContainers();

    // Delegação de cliques para navegação (semana e dia)
    bindGlobalClicks();

    // Navegação por swipe no mobile
    bindDaySwipe();

    // Pesquisa
    bindSearch();

    // Painel de debug com botões próprios
    mountDebugDock();

    // Carregar semana atual
    state.selectedDay = clampToWeek(state.selectedDay, state.weekStart) || state.weekStart;
    loadAndRenderWeek(state.weekStart);
  }

  // ====== CONTROLOS (delegação) ======
  function bindGlobalClicks(){
    document.addEventListener('click', (e) => {
      const t = e.target.closest(
        // Semana
        '#prevWeek, #nextWeek, #todayWeek, [data-week], .week-nav .prev, .week-nav .next, .week-nav .today,' +
        // Dia
        '#prevDay, #nextDay, #todayDay, [data-day], .mobile-day-buttons .prev, .mobile-day-buttons .next, .mobile-day-buttons .today'
      );
      if (!t) return;

      // Semana?
      const w = t.matches('#prevWeek, [data-week="prev"], .week-nav .prev') ? 'prev'
            : t.matches('#nextWeek, [data-week="next"], .week-nav .next') ? 'next'
            : t.matches('#todayWeek, [data-week="today"], .week-nav .today') ? 'today'
            : null;

      if (w){
        e.preventDefault();
        if (w==='prev') state.weekStart = addDays(state.weekStart,-7);
        if (w==='next') state.weekStart = addDays(state.weekStart, 7);
        if (w==='today') state.weekStart = startOfWeek(new Date());
        state.selectedDay = clampToWeek(state.selectedDay, state.weekStart) || state.weekStart;
        return loadAndRenderWeek(state.weekStart);
      }

      // Dia?
      const d = t.matches('#prevDay, [data-day="prev"], .mobile-day-buttons .prev') ? -1
              : t.matches('#nextDay, [data-day="next"], .mobile-day-buttons .next') ? +1
              : t.matches('#todayDay, [data-day="today"], .mobile-day-buttons .today') ? 0
              : null;
      if (d !== null){
        e.preventDefault();
        if (d===0) return setSelectedDay(new Date(), true);
        navigateDay(d);
      }
    });
  }

  function bindDaySwipe(){
    const area = qs('.mobile-day-container');
    if (!area) return;
    let x0=null, y0=null, t0=0;
    area.addEventListener('touchstart', (ev)=>{ const t=ev.changedTouches[0]; x0=t.clientX; y0=t.clientY; t0=Date.now(); }, {passive:true});
    area.addEventListener('touchend', (ev)=>{
      if (x0==null) return;
      const t=ev.changedTouches[0], dx=t.clientX-x0, dy=t.clientY-y0, dt=Date.now()-t0;
      x0=y0=null;
      if (Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy) && dt<600){
        if (dx<0) navigateDay(+1); else navigateDay(-1);
      }
    }, {passive:true});
  }

  function bindSearch(){
    const input = qs('#searchInput'), clear = qs('.search-clear');
    input?.addEventListener('input', debounce(()=>{
      state.filter = (input.value||'').trim().toLowerCase();
      renderAll();
    },150));
    clear?.addEventListener('click', ()=>{
      if (input) input.value=''; state.filter=''; renderAll();
    });
  }

  // ====== API ======
  async function apiListWeek(weekStart, weekEnd){
    const params = new URLSearchParams({ weekStart: toISODate(weekStart), weekEnd: toISODate(weekEnd) });
    try{
      const res = await fetch(`${API}?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text().catch(()=> ''));
      const data = await res.json().catch(()=> ({}));
      return data.appointments ?? data ?? [];
    } catch (e){
      console.warn('API falhou — usar mock:', e?.message || e);
      // MOCK visível para veres navegação a funcionar
      const base = startOfWeek(weekStart);
      return [
        { id:'m1', date: toISODate(base),     period:'AM', status:'NE', plate:'AA-11-BB', car:'Astra',   serviceType:'PB', store:'Guimarães' },
        { id:'m2', date: toISODate(addDays(base,1)), period:'PM', status:'VE', plate:'CC-22-DD', car:'Focus',   serviceType:'LT', store:'Famalicão' },
        { id:'m3', date: toISODate(addDays(base,3)), period:'AM', status:'ST', plate:'EE-33-FF', car:'Golf',    serviceType:'OC', store:'Braga' },
      ];
    }
  }
  async function saveAppointmentStatus(id, status){
    try{
      const res = await fetch(`${API}/${encodeURIComponent(id)}`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ status })
      });
      if (!res.ok) throw new Error(await res.text().catch(()=> ''));
      return res.json().catch(()=> ({}));
    } catch(e){
      console.warn('Falha PUT — mock OK:', e?.message || e);
      return { id, status }; // mock de sucesso para não travar UI
    }
  }

  // ====== LOAD & RENDER ======
  async function loadAndRenderWeek(weekStart){
    const weekEnd = addDays(weekStart,6);
    updateWeekRangeLabel(weekStart, weekEnd);
    state.selectedDay = clampToWeek(state.selectedDay, weekStart) || weekStart;

    setLoading(true);
    try{
      state.appointments = await apiListWeek(weekStart, weekEnd);
      renderAll();
    } finally {
      setLoading(false);
      updateDebugDock();
    }
  }

  function renderAll(){
    renderSchedule();
    renderUnscheduled();
    renderServicesTable();
    renderMobileDay(state.selectedDay);
    initMobileStatusControls();
  }

  // ====== DESKTOP ======
  function renderSchedule(){
    const table = qs('table.schedule'); if (!table) return;
    ensureScheduleSkeleton(table);
    const tbody = table.tBodies[0]; if (!tbody) return;
    [...tbody.querySelectorAll('td')].forEach(td => td.innerHTML='');
    const map = groupAppointmentsByDayPeriod(filteredAppointments());
    const days = weekDays(state.weekStart);
    ['AM','PM'].forEach((period, rowIdx) => {
      days.forEach((d, colIdx) => {
        const td = tbody.rows[rowIdx]?.cells[colIdx+1]; if (!td) return;
        const key = `${toISODate(d)}|${period}`;
        (map.get(key) || []).forEach(appt => td.appendChild(makeAppointmentCard(appt)));
      });
    });
  }
  function ensureScheduleSkeleton(table){
    if (!table.tHead){
      const thead = table.createTHead(); const tr = thead.insertRow();
      const th0 = document.createElement('th'); th0.textContent = ''; tr.appendChild(th0);
      weekDays(state.weekStart).forEach(d => {
        const th = document.createElement('th');
        th.innerHTML = `<div class="day">${formatWeekdayPT(d)}</div><div class="date">${formatDDMM(d)}</div>`;
        tr.appendChild(th);
      });
    } else {
      const ths = table.tHead.rows[0]?.cells; const days = weekDays(state.weekStart);
      if (ths && ths.length===8){
        days.forEach((d,i)=> ths[i+1].innerHTML = `<div class="day">${formatWeekdayPT(d)}</div><div class="date">${formatDDMM(d)}</div>`);
      }
    }
    if (!table.tBodies[0]){
      const tbody = table.createTBody();
      ['Manhã','Tarde'].forEach(label => {
        const tr = tbody.insertRow();
        const th = document.createElement('th'); th.textContent = label; tr.appendChild(th);
        for (let i=0;i<7;i++){ const td = document.createElement('td'); td.appendChild(el('div','drop-zone')); tr.appendChild(td); }
      });
    }
  }

  // ====== DESKTOP EXTRA ======
  function renderUnscheduled(){
    const listEl = qs('.unscheduled-list'); if (!listEl) return;
    const list = filteredAppointments().filter(a => !a.date);
    listEl.innerHTML=''; list.forEach(appt => listEl.appendChild(makeAppointmentCard(appt,true)));
  }
  function renderServicesTable(){
    const table = qs('.services-table'); if (!table) return;
    const tbody = table.tBodies[0] || table.createTBody(); tbody.innerHTML='';
    filteredAppointments().filter(a=>a.date).forEach(a=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatDDMM(parseISO(a.date))} ${a.period==='AM'?'Manhã':a.period==='PM'?'Tarde':''}</td>
        <td>${escape(a.plate||'')}</td>
        <td>${escape(a.car||'')}</td>
        <td><span class="badge badge-${escape(a.serviceType||'')}">${escape(a.serviceType||'')}</span></td>
        <td>${escape(a.store||'')}</td>
        <td><span class="chip ${chipClass(a.status)}">${escape((a.status||'NE').toUpperCase())}</span></td>
        <td class="actions"><button class="icon edit" data-id="${a.id}">✏️</button><button class="icon delete" data-id="${a.id}">🗑️</button></td>`;
      tbody.appendChild(tr);
    });
  }

  // ====== MOBILE (DIA) ======
  function renderMobileDay(date){
    const box = qs('.mobile-day-container'); if (!box) return;
    const header = box.querySelector('.mobile-day-header') || box.appendChild(el('div','mobile-day-header'));
    header.innerHTML = `<div class="mobile-day-label">${formatLongPT(date)}</div>`;
    let list = box.querySelector('.mobile-day-list'); if (!list){ list = el('div','mobile-day-list'); box.appendChild(list); }
    list.innerHTML='';
    const items = filteredAppointments().filter(a=>a.date===toISODate(date)).sort((a,b)=>(a.period||'').localeCompare(b.period||''));
    if (!items.length){ list.innerHTML = `<div class="appt-sub" style="text-align:center;opacity:.7">Sem serviços para este dia.</div>`; return; }
    items.forEach(appt => list.appendChild(makeAppointmentCard(appt)));
  }

  // ====== CARTÕES ======
  function makeAppointmentCard(appt, isUnscheduled=false){
    const card = el('div','appointment'+(isUnscheduled?' unscheduled':'')); card.dataset.id=appt.id??''; card.dataset.status=(appt.status||'NE').toUpperCase();
    const header = el('div','appt-header'); header.textContent=[appt.plate, appt.store].filter(Boolean).join(' • '); card.appendChild(header);
    const sub = el('div','appt-sub'); sub.textContent=[appt.car, appt.serviceType?`(${appt.serviceType})`:'', appt.period?(appt.period==='AM'?'Manhã':'Tarde'):''].filter(Boolean).join(' '); card.appendChild(sub);
    const chip = el('span',`chip ${chipClass(appt.status)}`); chip.textContent=(appt.status||'NE').toUpperCase(); card.appendChild(chip);
    if (window.matchMedia(MOBILE_QUERY).matches) paintCard(card, card.dataset.status);
    return card;
  }
  function chipClass(s){ s=(s||'NE').toUpperCase(); return s==='VE'?'chip-VE':s==='ST'?'chip-ST':'chip-NE'; }

  // ====== MOBILE: CONTROLos DE ESTADO ======
  function initMobileStatusControls(){
    const isMobile = window.matchMedia(MOBILE_QUERY).matches;
    qsa('.appointment').forEach(card=>{
      if (!isMobile){ card.querySelector('.appt-status-controls')?.remove(); return; }
      if (card.querySelector('.appt-status-controls')) return;
      const current = getCurrentStatus(card);
      const ctrl = el('div','appt-status-controls');
      ['NE','VE','ST'].forEach(code=>{
        const btn = el('button',`status-btn ${code}${code===current?' is-active':''}`); btn.type='button'; btn.textContent=code;
        btn.addEventListener('click', ev => { ev.stopPropagation(); onStatusClick(card, code, ctrl); });
        ctrl.appendChild(btn);
      });
      paintCard(card, current); card.appendChild(ctrl);
    });
  }
  function getCurrentStatus(card){
    const chip = card.querySelector('.chip-NE, .chip-VE, .chip-ST');
    if (chip){ if (chip.classList.contains('chip-NE')) return 'NE'; if (chip.classList.contains('chip-VE')) return 'VE'; if (chip.classList.contains('chip-ST')) return 'ST'; }
    return (card.dataset.status || 'NE').toUpperCase();
  }
  async function onStatusClick(card, newStatus, ctrl){
    const id = card.dataset.id; if (!id){ toast('error','Falta o data-id no cartão.'); return; }
    const prev = getCurrentStatus(card); if (prev===newStatus) return;
    setActiveButton(ctrl,newStatus); paintChip(card,newStatus); paintCard(card,newStatus); card.dataset.status=newStatus;
    try { await saveAppointmentStatus(id,newStatus); toast('success',`Estado atualizado para ${newStatus}.`); }
    catch(e){ setActiveButton(ctrl,prev); paintChip(card,prev); paintCard(card,prev); card.dataset.status=prev; toast('error','Falha ao gravar estado.'); console.error(e); }
  }
  function setActiveButton(ctrl,status){ qsa('.status-btn',ctrl).forEach(b=>b.classList.toggle('is-active', b.textContent===status)); }
  function paintChip(card,status){
    let chip = card.querySelector('.chip'); if (!chip){ chip = el('span','chip'); (card.querySelector('.appt-header')||card).appendChild(chip); }
    chip.className = 'chip ' + chipClass(status); chip.textContent = (status||'NE').toUpperCase();
  }
  function paintCard(card,status){
    card.classList.remove('card-NE','card-VE','card-ST');
    const s=(status||'NE').toUpperCase(); if (s==='NE') card.classList.add('card-NE'); if (s==='VE') card.classList.add('card-VE'); if (s==='ST') card.classList.add('card-ST');
  }

  // ====== NAV DIA ======
  function navigateDay(delta){
    const target = addDays(state.selectedDay, delta);
    const wkStartTarget = startOfWeek(target);
    if (wkStartTarget.getTime() !== state.weekStart.getTime()){
      state.weekStart = wkStartTarget; state.selectedDay = target; loadAndRenderWeek(state.weekStart);
    } else { setSelectedDay(target, false); }
  }
  function setSelectedDay(date, canShiftWeek){
    if (canShiftWeek){
      const wk = startOfWeek(date);
      if (wk.getTime() !== state.weekStart.getTime()){
        state.weekStart = wk; state.selectedDay = date; return loadAndRenderWeek(state.weekStart);
      }
    }
    state.selectedDay = date; renderMobileDay(state.selectedDay); initMobileStatusControls(); updateDebugDock();
  }

  // ====== HELPERS ======
  function filteredAppointments(){
    const f = state.filter; if (!f) return state.appointments;
    return state.appointments.filter(a => {
      const hay = [a.plate,a.car,a.serviceType,a.store,a.notes,a.status,a.period,a.date].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(f);
    });
  }
  function groupAppointmentsByDayPeriod(list){
    const map = new Map();
    list.forEach(a => {
      if (!a.date) return;
      const key = `${a.date}|${(a.period||'AM').toUpperCase()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    });
    return map;
  }
  function updateWeekRangeLabel(start,end){
    const el = qs('.week-range'); if (!el) return;
    const sameMonth = start.getMonth()===end.getMonth();
    el.textContent = sameMonth
      ? `${pad2(start.getDate())}–${pad2(end.getDate())} ${monthPT(start)} ${start.getFullYear()}`
      : `${pad2(start.getDate())} ${monthPT(start)} – ${pad2(end.getDate())} ${monthPT(end)} ${start.getFullYear()}`;
  }
  function setLoading(on){ document.body.classList.toggle('loading', !!on); }
  function toast(type,msg){
    const box = qs('.toast-container') || document.body.appendChild(el('div','toast-container'));
    const t = el('div',`toast ${type}`); t.textContent = msg; box.appendChild(t); setTimeout(()=>t.remove(), 2200);
  }

  // datas
  function startOfWeek(d){ const x=new Date(d.getFullYear(),d.getMonth(),d.getDate()); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return x; }
  function weekDays(ws){ return Array.from({length:7},(_,i)=>addDays(ws,i)); }
  function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function toISODate(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  function parseISO(s){ const [y,m,dd]=String(s||'').split('-').map(Number); return new Date(y,(m||1)-1,dd||1); }
  function formatDDMM(d){ return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`; }
  function formatWeekdayPT(d){ return ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][(d.getDay()+6)%7]; }
  function formatLongPT(d){ return `${formatWeekdayPT(d)} • ${pad2(d.getDate())} ${monthPT(d)}`; }
  function monthPT(d){ return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][d.getMonth()]; }
  function pad2(n){ return String(n).padStart(2,'0'); }
  function clampToWeek(date, weekStart){ const start=new Date(weekStart), end=addDays(start,6); if (date<start) return start; if (date>end) return end; return date; }

  // DOM utils
  function qs(s,r=document){ return r.querySelector(s); }
  function qsa(s,r=document){ return [...r.querySelectorAll(s)]; }
  function el(tag, cls){ const x=document.createElement(tag); if (cls) x.className=cls; return x; }

  // ====== CONTÊINERES MÍNIMOS (se HTML não tiver) ======
  function ensureMinimalContainers(){
    if (!qs('.toast-container')) document.body.appendChild(el('div','toast-container'));
    if (!qs('.mobile-day-container')){
      const c = el('div','mobile-day-container');
      c.appendChild(el('div','mobile-day-header'));
      c.appendChild(el('div','mobile-day-list'));
      document.body.appendChild(c);
    }
  }

  // ====== DEBUG DOCK ======
  function mountDebugDock(){
    if (qs('#eg-debug')) return;
    const box = document.createElement('div');
    box.id = 'eg-debug';
    box.innerHTML = `
      <h4>EG Debug</h4>
      <div class="row">
        <button data-week="prev">⟵ Semana</button>
        <button data-week="today">Hoje (semana)</button>
        <button data-week="next">Semana ⟶</button>
      </div>
      <div class="row">
        <button data-day="prev">⟵ Dia</button>
        <button data-day="today">Hoje (dia)</button>
        <button data-day="next">Dia ⟶</button>
      </div>
      <div class="row">
        <span class="pill" data-key="week"></span>
        <span class="pill" data-key="day"></span>
      </div>
      <div class="muted">Se isto mexe, o JS está OK. Se os teus botões não mexem, é só alinhar seletores.</div>
    `;
    document.body.appendChild(box);

    box.addEventListener('click', (e)=>{
      const t = e.target.closest('[data-week],[data-day]');
      if (!t) return;
      if (t.hasAttribute('data-week')){
        const v = t.getAttribute('data-week');
        if (v==='prev') state.weekStart = addDays(state.weekStart,-7);
        if (v==='next') state.weekStart = addDays(state.weekStart, 7);
        if (v==='today') state.weekStart = startOfWeek(new Date());
        state.selectedDay = clampToWeek(state.selectedDay, state.weekStart) || state.weekStart;
        loadAndRenderWeek(state.weekStart);
      } else {
        const v = t.getAttribute('data-day');
        if (v==='today') setSelectedDay(new Date(), true);
        if (v==='prev') navigateDay(-1);
        if (v==='next') navigateDay(+1);
      }
    });
    updateDebugDock();
  }
  function updateDebugDock(){
    const d = qs('#eg-debug'); if (!d) return;
    const wk = `${formatDDMM(state.weekStart)}–${formatDDMM(addDays(state.weekStart,6))}`;
    const sd = `${formatLongPT(state.selectedDay)}`;
    d.querySelector('[data-key="week"]').textContent = `Semana: ${wk}`;
    d.querySelector('[data-key="day"]').textContent  = `Dia: ${sd}`;
  }

})();