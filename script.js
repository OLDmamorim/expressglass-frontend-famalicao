Marco, tranquilo — resposta direta:

O que tens MESMO de mudar agora

1) public/script.js (substitui tudo)

> Aponta para /api/appointments e ativa os controlos de estado no mobile.



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

  const state = { weekStart: startOfWeek(new Date()), appointments: [], filter: '' };

  document.addEventListener('DOMContentLoaded', () => {
    bindNav(); bindSearch();
    document.querySelector('[data-action="print"]')?.addEventListener('click', () => window.print());
    loadAndRenderWeek(state.weekStart);
  });

  function bindNav(){
    qs('#prevWeek')?.addEventListener('click', () => { state.weekStart = addDays(state.weekStart,-7); loadAndRenderWeek(state.weekStart); });
    qs('#nextWeek')?.addEventListener('click', () => { state.weekStart = addDays(state.weekStart, 7); loadAndRenderWeek(state.weekStart); });
    qs('#todayWeek')?.addEventListener('click', () => { state.weekStart = startOfWeek(new Date());     loadAndRenderWeek(state.weekStart); });
  }
  function bindSearch(){
    const input = qs('#searchInput'), clear = qs('.search-clear');
    input?.addEventListener('input', debounce(() => { state.filter=(input.value||'').trim().toLowerCase(); renderAll(); },150));
    clear?.addEventListener('click', () => { if (input) input.value=''; state.filter=''; renderAll(); });
  }

  async function apiListWeek(weekStart, weekEnd){
    const res = await fetch(`${API}?weekStart=${toISODate(weekStart)}&weekEnd=${toISODate(weekEnd)}`);
    if (!res.ok) throw new Error(await res.text().catch(()=>'')); return (await res.json()).appointments ?? [];
  }
  async function saveAppointmentStatus(id, status){
    const res = await fetch(`${API}/${encodeURIComponent(id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ status }) });
    if (!res.ok) throw new Error(await res.text().catch(()=>'')); return res.json().catch(()=> ({}));
  }

  async function loadAndRenderWeek(weekStart){
    const weekEnd = addDays(weekStart,6); updateWeekRangeLabel(

