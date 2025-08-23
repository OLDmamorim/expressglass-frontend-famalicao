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

  /* ============ ESTADO ============ */
  const state = {
    weekStart: startOfWeek(new Date()),
    selectedDay: new Date(),       // NOVO: dia selecionado (mobile)
    appointments: [],
    filter: ''
  };

  /* ============ ARRANQUE ============ */
  document.addEventListener('DOMContentLoaded', () => {
    // Clampa o dia selecionado à semana corrente
    state.selectedDay = clampToWeek(state.selectedDay, state.weekStart);
    bindNavWeek();
    bindNavDay();           // NOVO: botões do dia
    bindDaySwipe();         // NOVO: swipe para mudar o dia
    bindSearch();
    qs('[data-action="print"]')?.addEventListener('click', () => window.print());
    loadAndRenderWeek(state.weekStart);
  });

  /* ============ NAV SEMANA ============ */
  function bindNavWeek(){
    qs('#prevWeek')?.addEventListener('click', () => {
      state.weekStart = addDays(state.weekStart, -7);
      // ao mudar semana, coloca selectedDay no 1º dia dessa semana
      state.selectedDay = clampToWeek(state.selectedDay, state.weekStart) || state.weekStart;
      loadAndRenderWeek(state.weekStart);
    });
    qs('#nextWeek')?.addEventListener('click', () => {
      state.weekStart = addDays(state.weekStart, 7);
      state.selectedDay = clampToWeek(state.selectedDay, state.weekStart) || state.weekStart;
      loadAndRenderWeek(state.weekStart);
    });
    qs('#todayWeek')?.addEventListener('click', () => {
      state.weekStart = startOfWeek(new Date());
      state.selectedDay = new Date();
      loadAndRenderWeek(state.weekStart);
    });
  }

  /* ============ NAV DIA (MOBILE) ============ */
  function bindNavDay(){
    const prevBtn = qs('[data-mobile="prev"]') || qs('#prevDay') || qs('.mobile-day-buttons .nav-button.prev');
    const nextBtn = qs('[data-mobile="next"]') || qs('#nextDay') || qs('.mobile-day-buttons .nav-button.next');
    const todayBtn= qs('[data-mobile="today"]')|| qs('#todayDay')|| qs('.mobile-day-buttons .nav-button.today');

    prevBtn?.addEventListener('click', () => navigateDay(-1));
    nextBtn?.addEventListener('click', () => navigateDay( 1));
    todayBtn?.addEventListener('click', () => setSelectedDay(new Date(), true));
  }

  // Swipe esquerda/direita na vista mobile para mudar de dia
  function bindDaySwipe(){
    const area = qs('.mobile-day-container');
    if (!area) return;
    let x0 = null, y0 = null, t0 = 0;

    area.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
    }, {passive:true});

    area.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      const dt = Date.now() - t0;
      x0 = y0 = null;

      // gesto horizontal rápido
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) && dt < 600){
        if (dx < 0) navigateDay( 1); // arrastar para a esquerda -> próximo dia
        else        navigateDay(-1); // arrastar para a direita -> dia anterior
      }
    }, {passive:true});
  }

  // Muda de dia; se sair da semana, muda de semana e recarrega
  function navigateDay(delta){
    const target = addDays(state.selectedDay, delta);
    const wkStartTarget = startOfWeek(target);
    if (wkStartTarget.getTime() !== state.weekStart.getTime()){
      state.weekStart = wkStartTarget;
      state.selectedDay = target;
      loadAndRenderWeek(state.weekStart); // renderAll usa selectedDay
    } else {
      setSelectedDay(target, false);      // só re-render
    }
  }

  function setSelectedDay(date, canShiftWeek){
    if (canShiftWeek){
      const wkStart = startOfWeek(date);
      if (wkStart.getTime() !== state.weekStart.getTime()){
        state.weekStart = wkStart;
        state.selectedDay = date;
        return loadAndRenderWeek(state.weekStart);
      }
    }
    state.selectedDay = date;
    renderMobileDay(state.selectedDay);
    initMobileStatusControls(); // re-monta controlos para novos cartões
  }

  /* ============ SEARCH ============ */
  function bindSearch(){
    const input = qs('#searchInput');
    const clear = qs('.search-clear');
    input?.addEventListener('input', debounce(() => {
      state.filter = (input.value || '').trim().toLowerCase();
      renderAll();
    }, 150));
    clear?.addEventListener('click', () => {
      if (input) input.value = '';
      state.filter = '';
      renderAll();
    });
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

  /* ============ LOAD & RENDER ============ */
  async function loadAndRenderWeek(weekStart){
    const weekEnd = addDays(weekStart, 6);
    updateWeekRangeLabel(weekStart, weekEnd);
    // garante que selectedDay está dentro da semana carregada
    state.selectedDay = clampToWeek(state.selectedDay, weekStart) || weekStart;

    setLoading(true);
    try {
      const appts = await apiListWeek(weekStart, weekEnd);
      state.appointments = Array.isArray(appts) ? appts : [];
      renderAll();
    } catch (e