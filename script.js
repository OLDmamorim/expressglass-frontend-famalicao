/* ===========================================
   script.js — Portal de Agendamentos ExpressGlass
   =========================================== */
(() => {
  'use strict';

  /* ===== API endpoint ===== */
  const API_BASE = location.hostname.includes('localhost')
    ? 'http://localhost:8888/api'   // dev com Netlify Dev
    : '/api';                       // produção (redirige para a Function)
  const API = `${API_BASE}/appointments`;
  const MOBILE_QUERY = '(max-width: 820px)';

  /* ===== Estado ===== */
  const state = {
    weekStart: startOfWeek(new Date()),
    selectedDay: new Date(),    // dia activo na vista mobile
    appointments: [],
    filter: ''
  };

  /* ===== Arranque ===== */
  document.addEventListener('DOMContentLoaded', init);
  // Segurança: se algo correr mal, nunca fiques com pointer-events bloqueados
  window.addEventListener('load', () => setTimeout(() => document.body.classList.remove('loading'), 800));

  function init(){
    // Garante que o dia seleccionado pertence à semana
    state.selectedDay = clampToWeek(state.selectedDay, state.weekStart) || state.weekStart;

    bindGlobalClicks();   // ← delegação: apanha cliques em botões de navegação
    bindSearch();

    // Botão de imprimir (se existir)
    const printBtn = qs('[data-action="print"]');
    if (printBtn) printBtn.addEventListener('click', () => window.print());

    // Carrega semana inicial
    loadAndRenderWeek(state.weekStart);
  }

  /* ===== Delegação de cliques (semana + dia) =====
     Funciona com estes seletores (usa os que tiveres no HTML):
     - Semana:  #prevWeek, #nextWeek, #todayWeek, [data-week="prev|next|today"], .week-nav .prev|next|today
     - Dia:     #prevDay,  #nextDay,  #todayDay,  [data-day="prev|next|today"],  .mobile-day-buttons .prev|next|today
  */
  function bindGlobalClicks(){
    document.addEventListener('click', (e) => {
      const t = e.target.closest(
        '#prevWeek, #nextWeek, #todayWeek, [data-week], .week-nav .prev, .week-nav .next, .week-nav .today,' +
        '#prevDay, #nextDay, #todayDay, [data-day], .mobile-day-buttons .prev, .mobile-day-buttons .next, .mobile-day-buttons .today'
      );
      if (!t) return;

      // Semana?
      const w = t.matches('#prevWeek, [data-week="prev"], .week-nav .prev') ? 'prev'
            : t.matches('#nextWeek, [data-week="next"], .week-nav .next') ? 'next'
            : t.matches('#todayWeek, [data-week="today"], .week-nav .today') ? 'today'
            : null;

      if (w) {
        e.preventDefault();
        if (w === 'prev') state.weekStart = addDays(state.weekStart, -7);
        if (w === 'next') state.weekStart = addDays(state.weekStart,  7);
        if (w === 'today') state.weekStart = startOfWeek(new Date());
        // sincroniza dia seleccionado com a nova semana
        state.selectedDay = clampToWeek(state.selectedDay, state.weekStart) || state.weekStart;
        loadAndRenderWeek(state.weekStart);
        return;
      }

      // Dia?
      const d = t.matches('#prevDay, [data-day="prev"], .mobile-day-buttons .prev') ? -1
            : t.matches('#nextDay, [data-day="next"], .mobile-day-buttons .next') ? +1
            : t.matches('#todayDay, [data-day="today"], .mobile-day-buttons .today') ? 0
            : null;

      if (d !== null) {
        e.preventDefault();
        if (d === 0) {
          setSelectedDay(new Date(), /*shiftWeek*/ true);
        } else {
          navigateDay(d);
        }
      }
    });

    // Swipe (mobile) para mudar de dia
    const area = qs('.mobile-day-container');
    if (area){
      let x0 = null, y0 = null, t0 = 0;
      area.addEventListener('touchstart', (ev) => {
        const t = ev.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
      }, {passive:true});
      area.addEventListener('touchend', (ev) => {
        if (x0 == null) return;
        const t = ev.changedTouches[0];
        const dx = t.clientX - x0, dy = t.clientY - y0, dt = Date.now() - t0;
        x0 = y0 = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) && dt < 600){
          if (dx < 0) navigateDay(+1); else navigateDay(-1);
        }
      }, {passive:true});
    }
  }

  /* ===== Pesquisa ===== */
  function bindSearch(){
    const input = qs('#searchInput');
    const clear = qs('.search-clear');
    if (input){
      input.addEventListener('input', debounce(() => {
        state.filter = (input.value || '').trim().toLowerCase();
        renderAll();
      }, 150));
    }
    if (clear){
      clear.addEventListener('click', () => {
        if (input) input.value = '';
        state.filter = '';
        renderAll();
      });
    }
  }

  /* ===== API ===== */
  async function apiListWeek(weekStart, weekEnd){
    const params = new URLSearchParams({ weekStart: toISODate(weekStart), weekEnd: toISODate(weekEnd) });
    const res = await fetch(`${API}?${params.toString()}`);
    if (!res.ok) throw new Error(await res.text().catch(()=> 'Erro ao listar semana'));
    const data = await res.json().catch(()=> ({}));
    return data.appointments ?? data ?? [];
  }
  async function saveAppointmentStatus(id, status){
    const res = await fetch(`${API}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error(await res.text().catch(()=> 'Falha ao atualizar estado'));
    return res.json().catch(()=> ({}));
  }

  /* ===== Load & Render ===== */
  async function loadAndRenderWeek(weekStart){
    const weekEnd = addDays(weekStart, 6);
    updateWeekRangeLabel(weekStart, weekEnd);
    // garante que o selectedDay está dentro desta semana
    state.selectedDay = clampToWeek(state.selectedDay, weekStart) || weekStart;

    setLoading(true);
    try {
      const appts = await apiListWeek(weekStart, weekEnd);
      state.appointments = Array.isArray(appts) ? appts : [];
      renderAll();
    } catch (e){
      console.error(e);
      toast('error', 'Não foi possível carregar a semana.');
    } finally {
      setLoading(false);
    }
  }

  function renderAll(){
    renderSchedule();
    renderUnscheduled();
    renderServicesTable();
    renderMobileDay(state.selectedDay);
    initMobileStatusControls();
  }

  /* ===== Calendário (desktop) ===== */
  function renderSchedule(){
    const table = qs('table.schedule'); if (!table) return;
    ensureScheduleSkeleton(table);
    const tbody = table.tBodies[0];
    const tds = tbody ? [...tbody.querySelectorAll('td')] : [];
    tds.forEach(td => td.innerHTML = '');
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
      if (ths && ths.length === 8){
        days.forEach((d, i) => ths[i+1].innerHTML = `<div class="day">${formatWeekdayPT(d)}</div><div class="date">${formatDDMM(d)}</div>`);
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

  /* ===== Unscheduled (desktop) ===== */
  function renderUnscheduled(){
    const listEl = qs('.unscheduled-list'); if (!listEl) return;
    const list = filteredAppointments().filter(a => !a.date);
    listEl.innerHTML = '';
    list.forEach(appt => listEl.appendChild(makeAppointmentCard(appt, true)));
  }

  /* ===== Services table (desktop) ===== */
  function renderServicesTable(){
    const table = qs('.services-table'); if (!table) return;
    const tbody = table.tBodies[0] || table.createTBody(); tbody.innerHTML = '';
    filteredAppointments().filter(a => a.date).forEach(a => {
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

  /* ===== Mobile day ===== */
  function renderMobileDay(date){
    const box = qs('.mobile-day-container'); if (!box) return;
    const header = box.querySelector('.mobile-day-header') || box.appendChild(el('div','mobile-day-header'));
    header.innerHTML = `<div class="mobile-day-label">${formatLongPT(date)}</div>`;
    let list = box.querySelector('.mobile-day-list'); if (!list){ list = el('div','mobile-day-list'); box.appendChild(list); }
    list.innerHTML = '';
    const items = filteredAppointments()
      .filter(a => a.date === toISODate(date))
      .sort((a,b) => (a.period||'').localeCompare(b.period||''));
    if (!items.length){
      list.innerHTML = `<div class="appt-sub" style="text-align:center;opacity:.7">Sem serviços para este dia.</div>`;
      return;
    }
    items.forEach(appt => list.appendChild(makeAppointmentCard(appt)));
  }

  /* ===== Cartões ===== */
  function makeAppointmentCard(appt, isUnscheduled=false){
    const card = el('div', 'appointment' + (isUnscheduled ? ' unscheduled' : ''));
    card.dataset.id = appt.id ?? '';
    card.dataset.status = (appt.status || 'NE').toUpperCase();

    const header = el('div','appt-header');
    header.textContent = [appt.plate, appt.store].filter(Boolean).join(' • ');
    card.appendChild(header);

    const sub = el('div','appt-sub');
    sub.textContent = [appt.car, appt.serviceType ? `(${appt.serviceType})` : '', appt.period ? (appt.period==='AM'?'Manhã':'Tarde') : '']
      .filter(Boolean).join(' ');
    card.appendChild(sub);

    const chip = el('span', `chip ${chipClass(appt.status)}`);
    chip.textContent = (appt.status || 'NE').toUpperCase();
    card.appendChild(chip);

    if (window.matchMedia(MOBILE_QUERY).matches) paintCard(card, card.dataset.status);
    return card;
  }
  function chipClass(s){ s=(s||'NE').toUpperCase(); return s==='VE'?'chip-VE':s==='ST'?'chip-ST':'chip-NE'; }

  /* ===== Mobile: controlos de estado NE/VE/ST ===== */
  function initMobileStatusControls(){
    const isMobile = window.matchMedia(MOBILE_QUERY).matches;
    qsa('.appointment').forEach(card => {
      if (!isMobile){ const old = card.querySelector('.appt-status-controls'); if (old) old.remove(); return; }
      if (card.querySelector('.appt-status-controls')) return;
      const current = getCurrentStatus(card);
      const ctrl = el('div','appt-status-controls');
      ['NE','VE','ST'].forEach(code => {
        const btn = el('button', `status-btn ${code}${code===current?' is-active':''}`); btn.type='button'; btn.textContent=code;
        btn.addEventListener('click', ev => { ev.stopPropagation(); onStatusClick(card, code, ctrl); });
        ctrl.appendChild(btn);
      });
      paintCard(card, current);
      card.appendChild(ctrl);
    });
  }
  function getCurrentStatus(card){
    const chip = card.querySelector('.chip-NE, .chip-VE, .chip-ST');
    if (chip){ if (chip.classList.contains('chip-NE')) return 'NE';
               if (chip.classList.contains('chip-VE')) return 'VE';
               if (chip.classList.contains('chip-ST')) return 'ST'; }
    return (card.dataset.status || 'NE').toUpperCase();
  }
  async function onStatusClick(card, newStatus, ctrl){
    const id = card.dataset.id; if (!id){ toast('error','Falta o data-id no cartão.'); return; }
    const prev = getCurrentStatus(card); if (prev === newStatus) return;
    setActiveButton(ctrl, newStatus); paintChip(card, newStatus); paintCard(card, newStatus); card.dataset.status = newStatus;
    try { await saveAppointmentStatus(id, newStatus); toast('success', `Estado atualizado para ${newStatus}.`); }
    catch(e){ setActiveButton(ctrl, prev); paintChip(card, prev); paintCard(card, prev); card.dataset.status = prev; toast('error','Falha ao gravar estado.'); console.error(e); }