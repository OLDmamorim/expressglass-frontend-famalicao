// ===== Config ===== //
const USE_API = false; // muda para true quando estiveres com a Function do Netlify a responder
const API_BASE = '/.netlify/functions/appointments';

// ===== Utilitários ===== //
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const fmtDate = (d) => new Date(d).toLocaleDateString('pt-PT');

function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36) }

// ===== Estado ===== //
let estado = {
  hoje: new Date(),
  diaAtivo: new Date(),
  pesquisa: '',
  filtroEstado: 'TODOS',
  selecionadoId: null,
  itens: [] // {id,data,periodo,matricula,carro,tipo,status,obs,extra}
};

// ===== Persistência (LocalStorage ou API) ===== //
const storeKey = 'eg_agendamentos_v1';

const api = {
  async list(){
    if(!USE_API){
      const raw = localStorage.getItem(storeKey) || '[]';
      return JSON.parse(raw);
    }
    const r = await fetch(API_BASE);
    return await r.json();
  },
  async saveAll(items){
    if(!USE_API){
      localStorage.setItem(storeKey, JSON.stringify(items));
      return {ok:true};
    }
    // exemplo de bulk update na API (ajusta ao teu backend)
    const r = await fetch(API_BASE, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(items)});
    return await r.json();
  },
};

// ===== Online indicator ===== //
function updateOnline(){
  const dot = $('#onlineDot');
  const txt = $('#onlineText');
  if(navigator.onLine){ dot.classList.add('online'); txt.textContent = 'Online'; }
  else { dot.classList.remove('online'); txt.textContent = 'Offline'; }
}
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);

// ===== Renderização ===== //
function renderPorAgendar(){
  const cont = $('#listaPorAgendar');
  cont.innerHTML = '';

  const dia = new Date(estado.diaAtivo);
  const start = new Date(dia); start.setHours(0,0,0,0);
  const end = new Date(dia); end.setHours(23,59,59,999);

  let lista = estado.itens.filter(x => new Date(x.data) >= start && new Date(x.data) <= end);
  if(estado.pesquisa){
    const q = estado.pesquisa.toLowerCase();
    lista = lista.filter(x => (x.matricula+x.carro+x.tipo+x.obs).toLowerCase().includes(q));
  }
  if(estado.filtroEstado !== 'TODOS'){
    lista = lista.filter(x => x.status === estado.filtroEstado);
  }

  if(lista.length === 0){
    cont.classList.add('empty');
    cont.innerHTML = '<p class="empty-text">Sem serviços para este dia.</p>';
    return;
  }
  cont.classList.remove('empty');

  for(const it of lista){
    const card = document.createElement('article');
    card.className = 'card status-' + it.status;
    card.innerHTML = `
      <div class="card-head">
        <strong>${fmtDate(it.data)} • ${it.periodo}</strong>
        <span class="badge">${it.status}</span>
      </div>
      <div class="card-body">
        <div><strong>${it.matricula}</strong> — ${it.carro || ''}</div>
        <div class="muted small">${it.tipo}</div>
        ${it.obs ? `<div class="small" style="margin-top:.3rem">${it.obs}</div>`:''}
        <div class="actions" style="margin-top:.6rem">
          <button class="btn small" data-act="editar" data-id="${it.id}">Editar</button>
          <button class="btn danger small" data-act="apagar" data-id="${it.id}">Apagar</button>
        </div>
      </div>
    `;
    cont.appendChild(card);
  }
}

function renderTabela(){
  const tb = $('#tabelaARealizar tbody');
  tb.innerHTML = '';
  const hoje = new Date(); hoje.setHours(0,0,0,0);

  const futuros = estado.itens.filter(x => new Date(x.data) >= hoje)
    .sort((a,b)=> new Date(a.data)-new Date(b.data));

  for(const it of futuros){
    const dias = Math.round((new Date(it.data) - hoje)/86400000);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(it.data)}</td>
      <td>${it.periodo}</td>
      <td>${it.matricula}</td>
      <td>${it.carro||''}</td>
      <td>${it.tipo}</td>
      <td>${it.obs||''}</td>
      <td>${it.status}</td>
      <td>${dias}</td>
      <td>
        <button class="btn small" data-act="editar" data-id="${it.id}">Editar</button>
        <button class="btn danger small" data-act="apagar" data-id="${it.id}">Apagar</button>
      </td>
    `;
    tb.appendChild(tr);
  }
}

function renderStats(){
  $('#statTotal').textContent = estado.itens.length;
  $('#statNE').textContent = estado.itens.filter(x => x.status==='NE').length;
  $('#statVE').textContent = estado.itens.filter(x => x.status==='VE').length;
  $('#statST').textContent = estado.itens.filter(x => x.status==='ST').length;
}

// ===== Form ===== //
function limparForm(){
  $('#formAgendamento').reset();
  estado.selecionadoId = null;
}

function preencherForm(it){
  $('#data').value = it.data.slice(0,10);
  $('#periodo').value = it.periodo;
  $('#matricula').value = it.matricula;
  $('#carro').value = it.carro||'';
  $('#tipo').value = it.tipo;
  $('#status').value = it.status;
  $('#obs').value = it.obs||'';
  $('#extra').value = it.extra||'';
}

function recolherForm(){
  const d = $('#data').value;
  return {
    id: estado.selecionadoId ?? uid(),
    data: d ? new Date(d).toISOString() : new Date().toISOString(),
    periodo: $('#periodo').value || 'Manhã',
    matricula: $('#matricula').value.toUpperCase(),
    carro: $('#carro').value,
    tipo: $('#tipo').value,
    status: $('#status').value,
    obs: $('#obs').value,
    extra: $('#extra').value,
  };
}

// ===== Eventos ===== //
function bindEvents(){
  $('#btnPrint').addEventListener('click', () => window.print());

  $('#btnPrev').addEventListener('click', ()=> moverSemana(-1));
  $('#btnNext').addEventListener('click', ()=> moverSemana(1));
  $('#btnToday').addEventListener('click', ()=> { estado.diaAtivo = new Date(); renderPorAgendar(); });

  $('#btnPrevDay').addEventListener('click', ()=> moverDia(-1));
  $('#btnNextDay').addEventListener('click', ()=> moverDia(1));
  $('#btnHojeList').addEventListener('click', ()=> { estado.diaAtivo = new Date(); renderPorAgendar(); });

  $('#search').addEventListener('input', (e)=> { estado.pesquisa = e.target.value; renderPorAgendar(); renderTabela(); });
  $('#btnClearSearch').addEventListener('click', ()=> { $('#search').value=''; estado.pesquisa=''; renderPorAgendar(); renderTabela(); });

  $('#filtroEstado').addEventListener('change', (e)=> { estado.filtroEstado = e.target.value; renderPorAgendar(); renderTabela(); });

  $('#btnNovoServicoTop').addEventListener('click', ()=> scrollToForm());
  $('#btnNovoServicoInline').addEventListener('click', ()=> scrollToForm());

  $('#formAgendamento').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const novo = recolherForm();
    const idx = estado.itens.findIndex(x => x.id === novo.id);
    if(idx >= 0) estado.itens[idx] = novo;
    else estado.itens.push(novo);
    await api.saveAll(estado.itens);
    limparForm();
    renderTudo();
  });

  $('#btnCancelar').addEventListener('click', limparForm);
  $('#btnEliminar').addEventListener('click', async ()=>{
    if(!estado.selecionadoId) return;
    estado.itens = estado.itens.filter(x => x.id !== estado.selecionadoId);
    await api.saveAll(estado.itens);
    limparForm();
    renderTudo();
  });

  // Delegação de eventos para cartões e tabela
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-act]');
    if(!btn) return;
    const id = btn.getAttribute('data-id');
    const act = btn.getAttribute('data-act');
    const it = estado.itens.find(x => x.id === id);
    if(!it) return;
    if(act === 'editar'){
      estado.selecionadoId = it.id;
      preencherForm(it);
      scrollToForm();
    } else if(act === 'apagar'){
      if(confirm('Apagar este agendamento?')){
        estado.itens = estado.itens.filter(x => x.id !== id);
        api.saveAll(estado.itens).then(renderTudo);
      }
    }
  });

  // Export / Import
  $('#btnExportJSON').addEventListener('click', ()=> downloadJSON());
  $('#btnExportCSV').addEventListener('click', ()=> downloadCSV());
  $('#btnExportar').addEventListener('click', ()=> downloadCSV());
  $('#btnExportQuick').addEventListener('click', ()=> downloadCSV());
  $('#inputImport').addEventListener('change', importFile);
}

function moverSemana(delta){
  const d = new Date(estado.diaAtivo);
  d.setDate(d.getDate() + delta*7);
  estado.diaAtivo = d;
  renderPorAgendar();
}
function moverDia(delta){
  const d = new Date(estado.diaAtivo);
  d.setDate(d.getDate() + delta);
  estado.diaAtivo = d;
  renderPorAgendar();
}

function scrollToForm(){ document.getElementById('formAgendamento').scrollIntoView({behavior:'smooth', block:'start'}); }

// ===== Export/Import ===== //
function download(filename, content, type='text/plain'){
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
}
function downloadJSON(){ download('agendamentos.json', JSON.stringify(estado.itens, null, 2), 'application/json'); }
function toCSV(items){
  const cols = ['id','data','periodo','matricula','carro','tipo','status','obs','extra'];
  const head = cols.join(';');
  const rows = items.map(it => cols.map(c => String(it[c]??'').replaceAll(';',',')).join(';'));
  return [head, ...rows].join('\n');
}
function downloadCSV(){ download('agendamentos.csv', toCSV(estado.itens), 'text/csv'); }

async function importFile(e){
  const f = e.target.files[0]; if(!f) return;
  const text = await f.text();
  try {
    if(f.name.endsWith('.json')){
      const arr = JSON.parse(text);
      if(!Array.isArray(arr)) throw new Error('JSON inválido');
      estado.itens = arr;
    } else {
      // CSV simples
      const [head, ...lines] = text.split(/\r?\n/).filter(Boolean);
      const cols = head.split(';');
      estado.itens = lines.map(line => {
        const vals = line.split(';');
        const o = {}; cols.forEach((c,i)=> o[c]=vals[i]);
        return o;
      });
    }
    await api.saveAll(estado.itens);
    renderTudo();
    alert('Importação concluída.');
  } catch(err){
    alert('Falha ao importar: ' + err.message);
  } finally {
    e.target.value = '';
  }
}

// ===== Boot ===== //
async function boot(){
  updateOnline();
  bindEvents();
  estado.itens = await api.list();

  // Se vazio, cria exemplos
  if(estado.itens.length === 0){
    const base = new Date(); base.setHours(0,0,0,0);
    estado.itens = [
      {id:uid(), data:new Date(base).toISOString(), periodo:'Manhã', matricula:'AA-00-01', carro:'VW Golf', tipo:'Substituição', status:'NE', obs:'Para cliente Fidelidade', extra:''},
      {id:uid(), data:new Date(base.setDate(base.getDate()+1)).toISOString(), periodo:'Tarde', matricula:'22-CC-33', carro:'BMW X3', tipo:'Reparação', status:'ST', obs:'Aguardar vidro', extra:''},
      {id:uid(), data:new Date(base.setDate(base.getDate()+1)).toISOString(), periodo:'Manhã', matricula:'00-AA-00', carro:'Peugeot 308', tipo:'Calibração', status:'VE', obs:'Concluído na loja', extra:''},
    ];
    await api.saveAll(estado.itens);
  }

  renderTudo();
}

function renderTudo(){
  renderPorAgendar();
  renderTabela();
  renderStats();
}

boot();