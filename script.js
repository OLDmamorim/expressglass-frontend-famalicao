/* =========================
   Configuração básica
========================= */
const CONFIG = {
  // Ajusta este endpoint ao teu backend. Se já tens algo tipo '/.netlify/functions/appointments'
  // ou '/api/appointments', coloca aqui.
  API: '/.netlify/functions/appointments'
};

// Estado simples da data selecionada
let dataSelecionada = new Date(); // hoje

/* =========================
   Utilitários de data
========================= */
function toISODate(d) {
  const z = new Date(d);
  z.setHours(0,0,0,0);
  return z.toISOString().slice(0,10);
}
function labelDia(d) {
  return d.toLocaleDateString('pt-PT', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
}
function semanaRange(d) {
  const dt = new Date(d);
  const day = dt.getDay() || 7; // 1..7 (segunda=1)
  const start = new Date(dt); start.setDate(dt.getDate() - (day-1));
  const end   = new Date(start); end.setDate(start.getDate() + 6);
  return {
    start, end,
    label: `${start.toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit'})} - ${end.toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric'})}`
  };
}

/* =========================
   Mapa de status -> classe/css texto
========================= */
const STATUS_MAP = {
  NE: { cls: 'status-NE', label: 'Sem encomenda' },
  VE: { cls: 'status-VE', label: 'Vidro encomendado' },
  ST: { cls: 'status-ST', label: 'Em stock' }
};

/* =========================
   Render do Cartão (MOBILE)
========================= */
function formatHojeOuData(iso){
  if(!iso) return '';
  const d = new Date(iso);
  const hoje = new Date(); hoje.setHours(