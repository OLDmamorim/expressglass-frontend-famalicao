/* ===========================================
   script.js — Portal de Agendamentos ExpressGlass
   - Calendário semanal (desktop)
   - Vista diária (mobile)
   - Controlo de estado NE/VE/ST no mobile (pinta cartão + grava BD)
   - Pesquisa, toasts, navegação de semanas
   =========================================== */

(() => {
  'use strict';

  /* ============ CONFIG ============ */
  const API = '/.netlify/functions/appointments'; // <- ajusta se necessário
  const MOBILE_QUERY = '(max-width: 820px)';

  /* ============ ESTADO ============ */
  const state = {
    weekStart: startOfWeek(new Date()),
    appointments: [],   // array de objetos: { id, date:'YYYY-MM-DD', period:'AM'|'PM', status:'NE'|'VE'|'ST', plate, car, serviceType, store, notes }
    filter: ''
  };

  /* ============ ARRANQUE ============ */
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    bindNav();
    bindSearch();
    bindHeaderActions();
    safeInitMobileButtons();
    loadAndRenderWeek(state.weekStart);
  }

  /* ============ BINDINGS ============ */
  function bindNav(){
    qs('#prevWeek')?.addEventListener('click', () => {
      state.weekStart = addDays(state.weekStart, -7);
      loadAndRenderWeek(state.weekStart);
    });
    qs('#nextWeek')?.addEventListener('click', () => {
      state.weekStart = addDays(state.weekStart, 7);
      loadAndRenderWeek(state.weekStart);
    });
    qs('#todayWeek')?.addEventListener('click', () => {
      state.weekStart = startOfWeek(new Date());
      loadAndRenderWeek(state.weekStart);
    });
  }

  function bindSearch(){
    const input = qs('#searchInput');
    const clear = qs('.search-clear');
    if (input){
      input.addEventListener('input', debounce(() => {
        state.filter = (input.value || '').trim().toLowerCase();
        renderAll();
      }, 150));
    }
    clear?.addEventListener('click', () => {
      if (input) input.value = '';
      state.filter = '';
      renderAll();
    });
  }

  // Caso tenhas botões no header (ex.: imprimir, novo, etc.) — apenas “armadilhas” seguras
  function bindHeaderActions(){
    qs('[data-action="print"]')?.addEventListener('click', () => window.print());
    // Adiciona aqui outras ações se existirem
  }

  /* ============ API ============ */
  async function apiListWeek(weekStart, weekEnd){
    const params = new URLSearchParams({
      weekStart: toISODate(weekStart),
      weekEnd  : toISODate(weekEnd)
    });
    const res = await fetch(`${API}?${params.toString()}`, { method: 'GET' });
    if (!res.ok) throw new Error(await res.text().catch(()=> 'Erro ao listar semana'));
    const data = await res.json().catch(()=> ({}));
    // Aceita {appointments:[...]} ou array direto
    return data.appointments ?? data ?? [];
  }

  async function saveAppointmentStatus(id, status){
    const res = await fetch(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    });
    if (!res.ok) throw new Error(await res.text().catch(()=> 'Falha ao atualizar estado'));
    return res.json().catch(()=> ({}));
  }

  /* ============ LOAD & RENDER ============ */
  async function loadAndRenderWeek(weekStart){
    const weekEnd = addDays(weekStart, 6);
    updateWeekRangeLabel(weekStart, weekEnd);
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
    renderMobileDay(getTodayClamped());
    // montar controlos de estado no mobile
    initMobileStatusControls();
  }

  /* ============ RENDER: CALENDÁRIO (DESKTOP) ============ */
  function renderSchedule(){
    const table = qs('table.schedule');
    if (!table) return; // não renderiza se não existir

    // Assegura head + corpo
    ensureScheduleSkeleton(table);

    const tbody = table.tBodies[0];
    if (!tbody) return;

    // Limpa células (excepto THs)
    [...tbody.querySelectorAll('td')].forEach(td => td.innerHTML = '');

    const map = groupAppointmentsByDayPeriod(filteredAppointments());
    const days = weekDays(state.weekStart);

    // Insere cartões
    ['AM','PM'].forEach((period, rowIdx) => {
      days.forEach((d, colIdx) => {
        const td = tbody.rows[rowIdx]?.cells[colIdx+1]; // +1 porque 1ª coluna é TH (Manhã/Tarde)
        if (!td) return;
        const key = `${toISODate(d)}|${period}`;
        const list = map.get(key) || [];
        list.forEach(appt => td.appendChild(makeAppointmentCard(appt)));
      });
    });
  }

  function ensureScheduleSkeleton(table){
    // Cria THEAD com dias se não existir
    if (!table.tHead){
      const thead = table.createTHead();
      const tr = thead.insertRow();
      // 1ª célula vazia (coluna de períodos)
      const th0 = document.createElement('th');
      th0.textContent = '';
      tr.appendChild(th0);

      weekDays(state.weekStart).forEach(d => {
        const th = document.createElement('th');
        th.innerHTML = `<div class="day">${formatWeekdayPT(d)}</div><div class="date">${formatDDMM(d)}</div>`;
        tr.appendChild(th);
      });
    } else {
      // Atualiza as datas do head
      const ths = table.tHead.rows[0]?.cells;
      const days = weekDays(state.weekStart);
      if (ths && ths.length === 8){
        days.forEach((d, i) => {
          ths[i+1].innerHTML = `<div class="day">${formatWeekdayPT(d)}</div><div class="date">${formatDDMM(d)}</div>`;
        });
      }
    }

    // Cria TBODY com 2 linhas (Manhã/Tarde) se não existir
    if (!table.tBodies[0]){
      const tbody = table.createTBody();
      ['Manhã','Tarde'].forEach(label => {
        const tr = tbody.insertRow();
        const th = document.createElement('th');
        th.textContent = label;
        tr.appendChild(th);
        // 7 colunas para os dias
        for (let i=0;i<7;i++){
          const td = document.createElement('td');
          const dz = document.createElement('div');
          dz.className = 'drop-zone';
          td.appendChild(dz);
          tr.appendChild(td);
        }
      });
    }
  }

  /* ============ RENDER: UNSCHEDULED (DESKTOP) ============ */
  function renderUnscheduled(){
    const box = qs('.unscheduled-container');
    const listEl = qs('.unscheduled-list');
    if (!box || !listEl) return;

    const list = filteredAppointments().filter(a => !a.date);
    box.style.display = list.length ? 'block' : 'block'; // fica sempre visível (desktop), CSS oculta mobile

    listEl.innerHTML = '';
    list.forEach(appt => {
      const card = makeAppointmentCard(appt, true);
      listEl.appendChild(card);
    });
  }

  /* ============ RENDER: SERVICES TABLE (DESKTOP) ============ */
  function renderServicesTable(){
    const box = qs('.services-table-container');
    const table = qs('.services-table');
    if (!box || !table) return;

    const tbody = table.tBodies[0] || table.createTBody();
    tbody.innerHTML = '';

    const list = filteredAppointments().filter(a => a.date);
    list.forEach(a => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatDDMM(parseISO(a.date))} ${a.period === 'AM' ? 'Manhã' : a.period === 'PM' ? 'Tarde' : ''}</td>
        <td>${escape(a.plate || '')}</td>
        <td>${escape(a.car || '')}</td>
        <td><span class="badge badge-${escape(a.serviceType || '')}">${escape(a.serviceType || '')}</span></td>
        <td>${escape(a.store || '')}</td>
        <td>
          <span class="chip ${chipClass(a.status)}">${escape(a.status || 'NE')}</span>
        </td>
        <td class="actions">
          <button class="icon edit" title="Editar" data-action="edit" data-id="${a.id}">✏️</button>
          <button class="icon delete" title="Apagar" data-action="delete" data-id="${a.id}">🗑️</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ============ RENDER: MOBILE DAY ============ */
  function renderMobileDay(date){
    const box = qs('.mobile-day-container');
    if (!box) return;

    // Cabeçalho simples
    const header = box.querySelector('.mobile-day-header') || (() => {
      const h = document.createElement('div');
      h.className = 'mobile-day-header';
      box.appendChild(h);
      return h;
    })();
    header.innerHTML = `
      <div class="mobile-day-label">${formatLongPT(date)}</div>
    `;

    // Lista
    let list = box.querySelector('.mobile-day-list');
    if (!list){
      list = document.createElement('div');
      list.className = 'mobile-day-list';
      box.appendChild(list);
    }
    list.innerHTML = '';

    const items = filteredAppointments().filter(a => a.date === toISODate(date));
    // Ordena por período
    items.sort((a,b) => (a.period||'').localeCompare(b.period||''));
    if (!items.length){
      list.innerHTML = `<div class="appt-sub" style="text-align:center;opacity:.7">Sem serviços para hoje.</div>`;
      return;
    }
    items.forEach(appt => list.appendChild(makeAppointmentCard(appt)));
  }

  /* ============ COMPONENTES ============ */
  function makeAppointmentCard(appt, isUnscheduled = false){
    const card = document.createElement('div');
    card.className = 'appointment' + (isUnscheduled ? ' unscheduled' : '');
    card.dataset.id = appt.id ?? '';
    card.dataset.status = (appt.status || 'NE').toUpperCase();

    // Header + subinfo
    const header = document.createElement('div');
    header.className = 'appt-header';
    header.textContent = [appt.plate, appt.store].filter(Boolean).join(' • ');
    card.appendChild(header);

    const sub = document.createElement('div');
    sub.className = 'appt-sub';
    const infoLine = [
      appt.car,
      appt.serviceType ? `(${appt.serviceType})` : '',
      appt.period ? (appt.period === 'AM' ? 'Manhã' : 'Tarde') : ''
    ].filter(Boolean).join(' ');
    sub.textContent = infoLine || '';
    card.appendChild(sub);

    // Chip de estado
    const chip = document.createElement('span');
    chip.className = 'chip ' + chipClass(appt.status);
    chip.textContent = (appt.status || 'NE').toUpperCase();
    card.appendChild(chip);

    // Se estivermos em mobile, já pinta o cartão
    if (window.matchMedia(MOBILE_QUERY).matches){
      paintCard(card, card.dataset.status);
    }

    return card;
  }

  function chipClass(status){
    const s = (status || 'NE').toUpperCase();
    if (s === 'NE') return 'chip-NE';
    if (s === 'VE') return 'chip-VE';
    if (s === 'ST') return 'chip-ST';
    return 'chip-NE';
  }

  /* ============ MOBILE: CONTROLOS DE ESTADO NE/VE/ST ============ */
  function initMobileStatusControls(){
    const isMobile = window.matchMedia(MOBILE_QUERY).matches;
    const cards = qsa('.appointment');
    cards.forEach(card => {
      // Limpa se não for mobile
      if (!isMobile){
        card.querySelector('.appt-status-controls')?.remove();
        return;
      }
      // Se já tem, sai
      if (card.querySelector('.appt-status-controls')) return;

      const current = getCurrentStatus(card);
      const ctrl = document.createElement('div');
      ctrl.className = 'appt-status-controls';

      ['NE','VE','ST'].forEach(code => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `status-btn ${code}` + (code===current ? ' is-active' : '');
        btn.textContent = code;
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onStatusClick(card, code, ctrl);
        });
        ctrl.appendChild(btn);
      });

      paintCard(card, current);
      card.appendChild(ctrl);
    });
  }

  function getCurrentStatus(card){
    const chip = card.querySelector('.chip-NE, .chip-VE, .chip-ST');
    if (chip){
      if (chip.classList.contains('chip-NE')) return 'NE';
      if (chip.classList.contains('chip-VE')) return 'VE';
      if (chip.classList.contains('chip-ST')) return 'ST';
    }
    return (card.dataset.status || 'NE').toUpperCase();
  }

  async function onStatusClick(card, newStatus, ctrl){
    const id = card.dataset.id;
    if (!id){
      toast('error', 'Falta o data-id no cartão para atualizar o estado.');
      return;
    }
    const prev = getCurrentStatus(card);
    if (prev === newStatus) return;

    // UI otimista
    setActiveButton(ctrl, newStatus);
    paintChip(card, newStatus);
    paintCard(card, newStatus);
    card.dataset.status = newStatus;

    try {
      await saveAppointmentStatus(id, newStatus);
      toast('success', `Estado atualizado para ${newStatus}.`);
    } catch (e){
      // Reverte
      setActiveButton(ctrl, prev);
      paintChip(card, prev);
      paintCard(card, prev);
      card.dataset.status = prev;
      toast('error', 'Falha ao gravar estado. Tenta novamente.');
      console.error(e);
    }
  }

  function setActiveButton(ctrl, status){
    qsa('.status-btn', ctrl).forEach(b => b.classList.toggle('is-active', b.textContent === status));
  }

  function paintChip(card, status){
    let chip = card.querySelector('.chip');
    if (!chip){
      chip = document.createElement('span');
      chip.className = 'chip';
      (card.querySelector('.appt-header') || card).appendChild(chip);
    }
    chip.className = 'chip ' + chipClass(status);
    chip.textContent = (status || 'NE').toUpperCase();
  }

  function paintCard(card, status){
    card.classList.remove('card-NE','card-VE','card-ST');
    const s = (status || 'NE').toUpperCase();
    if (s === 'NE') card.classList.add('card-NE');
    if (s === 'VE') card.classList.add('card-VE');
    if (s === 'ST') card.classList.add('card-ST');
  }

  /* ============ HELPERS UI ============ */
  function filteredAppointments(){
    const f = state.filter;
    if (!f) return state.appointments;
    return state.appointments.filter(a => {
      const hay = [
        a.plate, a.car, a.serviceType, a.store, a.notes,
        a.status, a.period, a.date
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(f);
    });
  }

  function groupAppointmentsByDayPeriod(list){
    const map = new Map();
    list.forEach(a => {
      if (!a.date) return;
      const per = (a.period || 'AM').toUpperCase();
      const key = `${a.date}|${per}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    });
    return map;
  }

  function updateWeekRangeLabel(start, end){
    const el = qs('.week-range');
    if (!el) return;
    const sameMonth = start.getMonth() === end.getMonth();
    const label = sameMonth
      ? `${pad2(start.getDate())}–${pad2(end.getDate())} ${monthPT(start)} ${start.getFullYear()}`
      : `${pad2(start.getDate())} ${monthPT(start)} – ${pad2(end.getDate())} ${monthPT(end)} ${start.getFullYear()}`;
    el.textContent = label;
  }

  function setLoading(on){
    document.body.classList.toggle('loading', !!on);
  }

  function toast(type, message){
    const box = qs('.toast-container') || (() => {
      const el = document.createElement('div');
      el.className = 'toast-container';
      document.body.appendChild(el);
      return el;
    })();
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    box.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  function safeInitMobileButtons(){
    // Se tiveres botões próprios para mudar o dia no mobile, liga-os aqui
    // Ex.: qs('[data-mobile="prev"]') ...
  }

  /* ============ DATAS ============ */
  function startOfWeek(d){
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = (date.getDay() + 6) % 7; // 0=Seg, 6=Dom
    date.setDate(date.getDate() - day);
    return date;
  }
  function weekDays(weekStart){
    return Array.from({length:7}, (_,i) => addDays(weekStart, i));
  }
  function addDays(d, n){
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function toISODate(d){
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  function parseISO(str){
    const [y,m,dd] = String(str||'').split('-').map(Number);
    return new Date(y, (m||1)-1, dd||1);
  }
  function formatDDMM(d){
    return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`;
  }
  function formatWeekdayPT(d){
    const names = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    return names[(d.getDay()+6)%7];
  }
  function formatLongPT(d){
    return `${formatWeekdayPT(d)} • ${pad2(d.getDate())} ${monthPT(d)}`;
  }
  function monthPT(d){
    const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return names[d.getMonth()];
  }
  function pad2(n){ return String(n).padStart(2,'0'); }
  function getTodayClamped(){
    const today = new Date();
    // Se hoje não pertence à semana atual, mostra 1º dia da semana
    const end = addDays(state.weekStart, 6);
    if (today < state.weekStart || today > end) return state.weekStart;
    return today;
  }

  /* ============ UTILS ============ */
  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return [...root.querySelectorAll(sel)]; }
  function escape(s){ return String(s ?? '').replace(/[&<>"'`=\/]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[c])); }
  function debounce(fn, ms){ let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); }; }

})();