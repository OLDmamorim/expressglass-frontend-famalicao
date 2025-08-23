/* ===========================================
   script.js — compatível e alinhado ao teu index.html
   =========================================== */
(function(){
  "use strict";

  // ===== API base =====
  var API_BASE = location.hostname.indexOf("localhost") > -1 ? "http://localhost:8888/api" : "/api";
  var API = API_BASE + "/appointments";

  // ===== Estado =====
  var state = {
    weekStart: startOfWeek(new Date()),
    selectedDay: new Date(),
    appointments: [],
    filter: ""
  };

  // ===== Arranque =====
  document.addEventListener("DOMContentLoaded", function(){
    bindWeekNav();
    bindDayNav();
    bindSearch();
    bindPrint();
    bindModal();
    loadAndRenderWeek(state.weekStart);
  });

  // ===== Ligações UI =====
  function bindWeekNav(){
    var prev = byId("prevWeek"), next = byId("nextWeek"), today = byId("todayWeek");
    if (prev) prev.addEventListener("click", function(){ shiftWeek(-1); });
    if (next) next.addEventListener("click", function(){ shiftWeek(+1); });
    if (today) today.addEventListener("click", function(){ goToTodayWeek(); });
  }
  function bindDayNav(){
    var prev = byId("prevDay"), next = byId("nextDay"), today = byId("todayDay");
    if (prev) prev.addEventListener("click", function(){ navigateDay(-1); });
    if (next) next.addEventListener("click", function(){ navigateDay(+1); });
    if (today) today.addEventListener("click", function(){ setSelectedDay(new Date(), true); });

    // swipe mobile
    var area = byId("mobileDayView");
    if (area){
      var x0=null,y0=null,t0=0;
      area.addEventListener("touchstart", function(ev){
        var t = ev.changedTouches[0]; x0=t.clientX; y0=t.clientY; t0=Date.now();
      }, {passive:true});
      area.addEventListener("touchend", function(ev){
        if (x0==null) return;
        var t = ev.changedTouches[0], dx=t.clientX-x0, dy=t.clientY-y0, dt=Date.now()-t0;
        x0=y0=null;
        if (Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy) && dt<600){
          if (dx<0) navigateDay(+1); else navigateDay(-1);
        }
      }, {passive:true});
    }
  }
  function bindSearch(){
    var btn = byId("searchBtn"), bar = byId("searchBar"),
        input = byId("searchInput"), clear = byId("clearSearch");
    if (btn && bar) btn.addEventListener("click", function(){ toggleClass(bar, "hidden"); input && input.focus(); });
    if (input) input.addEventListener("input", debounce(function(){
      state.filter = (input.value || "").trim().toLowerCase();
      renderAll();
    },150));
    if (clear) clear.addEventListener("click", function(){
      if (input) input.value = "";
      state.filter = "";
      renderAll();
    });
  }
  function bindPrint(){ var p = byId("printPage"); if (p) p.addEventListener("click", function(){ window.print(); }); }

  // ===== Modal: abrir/fechar + submit =====
  function bindModal(){
    var closeBtn = byId("closeModal");
    var cancelBtn = byId("cancelForm");
    var form = byId("appointmentForm");
    var addMobile = byId("addServiceMobile");
    var addDesk = byId("addServiceBtn");

    if (closeBtn) closeBtn.addEventListener("click", closeAppointmentModal);
    if (cancelBtn) cancelBtn.addEventListener("click", function(e){ e.preventDefault(); closeAppointmentModal(); });
    if (form) form.addEventListener("submit", onFormSubmit);
    if (addMobile) addMobile.addEventListener("click", openAppointmentModal);
    if (addDesk) addDesk.addEventListener("click", openAppointmentModal);

    // Expor função global para o teu onclick inline
    window.openAppointmentModal = openAppointmentModal;
  }

  function openAppointmentModal(){
    // Limpar form
    setValue("appointmentDate", "");
    setValue("appointmentPeriod", "");
    setValue("appointmentPlate", "");
    setValue("appointmentCar", "");
    setValue("appointmentService", "");
    setValue("appointmentStatus", "NE");
    setValue("appointmentNotes", "");
    setValue("appointmentExtra", "");
    var title = byId("modalTitle"); if (title) title.textContent = "Novo Agendamento";
    var del = byId("deleteAppointment"); if (del) addClass(del, "hidden");

    // Pré-preenche a data com o dia selecionado
    var d = toISODate(state.selectedDay);
    setValue("appointmentDate", d);

    var modal = byId("appointmentModal");
    if (modal) addClass(modal, "show");
  }
  function closeAppointmentModal(){
    var modal = byId("appointmentModal");
    if (modal) removeClass(modal, "show");
  }

  function onFormSubmit(e){
    e.preventDefault();

    // Ler campos
    var date = getValue("appointmentDate");
    var periodLabel = getValue("appointmentPeriod"); // "Manhã" | "Tarde" | ""
    var period = periodLabel === "Manhã" ? "AM" : periodLabel === "Tarde" ? "PM" : "";
    var plate = (getValue("appointmentPlate") || "").trim();
    var car = (getValue("appointmentCar") || "").trim();
    var serviceType = getValue("appointmentService") || "";
    var status = (getValue("appointmentStatus") || "NE").toUpperCase();
    var notes = getValue("appointmentNotes") || "";
    var extra = getValue("appointmentExtra") || "";

    if (!plate || !car || !serviceType){
      toast("error","Preenche Matrícula, Carro e Tipo de Serviço.");
      return;
    }

    var payload = {
      date: date || null,
      period: period || null,
      plate: plate,
      car: car,
      serviceType: serviceType,
      status: status,
      notes: notes,
      extra: extra,
      store: "Famalicão"
    };

    setLoading(true);
    apiCreateAppointment(payload, function(err, created){
      setLoading(false);
      if (err){
        // Fallback local
        var local = payload;
        local.id = "local-" + Date.now();
        state.appointments.push(local);
        toast("info","Sem ligação: guardado localmente.");
      } else {
        state.appointments.push(created);
        toast("success","Agendamento criado.");
      }
      // Re-render e fechar
      renderAll();
      closeAppointmentModal();
    });
  }

  // ===== API =====
  function apiListWeek(weekStart, weekEnd, cb){
    var url = API + "?weekStart=" + toISODate(weekStart) + "&weekEnd=" + toISODate(weekEnd);
    fetch(url).then(function(res){
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function(data){
      cb(null, data && (data.appointments || data) || []);
    }).catch(function(e){
      console.warn("GET falhou, usar mock:", e && e.message);
      // MOCK
      var b = startOfWeek(weekStart);
      var mock = [
        { id:"m1", date: toISODate(b),           period:"AM", status:"NE", plate:"AA-11-BB", car:"Astra",  serviceType:"PB", store:"Guimarães" },
        { id:"m2", date: toISODate(addDays(b,1)), period:"PM", status:"VE", plate:"CC-22-DD", car:"Focus",  serviceType:"LT", store:"Famalicão" },
        { id:"m3", date: toISODate(addDays(b,3)), period:"AM", status:"ST", plate:"EE-33-FF", car:"Golf",   serviceType:"OC", store:"Braga" }
      ];
      cb(null, mock);
    });
  }

  function apiCreateAppointment(payload, cb){
    fetch(API, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    }).then(function(res){
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function(obj){
      // a Function pode devolver o objeto criado ou {id:..}
      var created = typeof obj === "object" ? obj : {};
      if (!created.id) created.id = "srv-" + Date.now();
      // Garante campos visuais
      if (!created.date) created.date = payload.date;
      if (!created.period) created.period = payload.period;
      if (!created.plate) created.plate = payload.plate;
      if (!created.car) created.car = payload.car;
      if (!created.serviceType) created.serviceType = payload.serviceType;
      if (!created.status) created.status = payload.status;
      if (!created.store) created.store = payload.store;
      cb(null, created);
    }).catch(function(e){
      cb(e || new Error("Falha POST"));
    });
  }

  function apiUpdateStatus(id, status, cb){
    fetch(API + "/" + encodeURIComponent(id), {
      method: "PUT",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ status: status })
    }).then(function(res){
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function(x){ cb(null, x); })
      .catch(function(e){ cb(e || new Error("Falha PUT")); });
  }

  // ===== Load & Render =====
  function loadAndRenderWeek(weekStart){
    var weekEnd = addDays(weekStart, 6);
    updateWeekRangeLabel(weekStart, weekEnd);
    state.selectedDay = clampToWeek(state.selectedDay, weekStart) || weekStart;

    setLoading(true);
    apiListWeek(weekStart, weekEnd, function(err, list){
      setLoading(false);
      state.appointments = Array.isArray(list) ? list : [];
      renderAll();
    });
  }

  function renderAll(){
    renderSchedule();
    renderUnscheduled();
    renderServicesTable();
    renderMobileDay(state.selectedDay);
    initMobileStatusControls();
  }

  // ===== Calendário semanal =====
  function renderSchedule(){
    var table = byId("schedule");
    if (!table) return;
    table.className = "schedule";
    ensureScheduleSkeleton(table);

    var tbody = table.tBodies[0];
    var tds = tbody ? tbody.getElementsByTagName("td") : [];
    for (var i=0;i<tds.length;i++) tds[i].innerHTML = "";

    var map = groupByDayPeriod(filteredAppointments());
    var days = weekDays(state.weekStart);
    var periods = ["AM","PM"];

    for (var r=0;r<periods.length;r++){
      for (var c=0;c<days.length;c++){
        var td = tbody.rows[r] && tbody.rows[r].cells[c+1];
        if (!td) continue;
        var key = toISODate(days[c]) + "|" + periods[r];
        var arr = map.get(key) || [];
        for (var k=0;k<arr.length;k++){
          td.appendChild(makeCard(arr[k]));
        }
      }
    }
  }
  function ensureScheduleSkeleton(table){
    if (!table.tHead){
      var thead = table.createTHead();
      var tr = thead.insertRow();
      var th0 = document.createElement("th"); th0.textContent = ""; tr.appendChild(th0);
      var days = weekDays(state.weekStart);
      for (var i=0;i<7;i++){
        var th = document.createElement("th");
        th.innerHTML = '<div class="day">'+ wdPT(days[i]) +'</div><div class="date">'+ ddmm(days[i]) +'</div>';
        tr.appendChild(th);
      }
    } else {
      var ths = table.tHead.rows[0] ? table.tHead.rows[0].cells : null;
      var ds = weekDays(state.weekStart);
      if (ths && ths.length === 8){
        for (var j=0;j<7;j++){
          ths[j+1].innerHTML = '<div class="day">'+ wdPT(ds[j]) +'</div><div class="date">'+ ddmm(ds[j]) +'</div>';
        }
      }
    }
    if (!table.tBodies[0]){
      var tbody = table.createTBody();
      var labels = ["Manhã","Tarde"];
      for (var r=0;r<labels.length;r++){
        var trb = tbody.insertRow();
        var th = document.createElement("th"); th.textContent = labels[r]; trb.appendChild(th);
        for (var i=0;i<7;i++){ trb.appendChild(document.createElement("td")); }
      }
    }
  }

  // ===== Unscheduled =====
  function renderUnscheduled(){
    var listEl = byId("unscheduledList"); if (!listEl) return;
    listEl.innerHTML = "";
    var list = filteredAppointments().filter(function(a){ return !a.date; });
    for (var i=0;i<list.length;i++){ listEl.appendChild(makeCard(list[i], true)); }
    if (!listEl.children.length){
      var dz = document.createElement("div");
      dz.className = "drop-zone empty";
      dz.innerHTML = '<div class="unscheduled-empty-msg">Sem serviços por agendar.<br><small>Usa "+ Novo Serviço".</small></div>';
      listEl.appendChild(dz);
    }
  }

  // ===== Tabela de serviços =====
  function renderServicesTable(){
    var tbody = byId("servicesTableBody"); if (!tbody) return;
    tbody.innerHTML = "";
    var list = filteredAppointments().filter(function(a){ return !!a.date; });
    for (var i=0;i<list.length;i++){
      var a = list[i];
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>"+ ddmm(parseISO(a.date)) +"</td>" +
        "<td>"+ (a.period==="AM"?"Manhã":a.period==="PM"?"Tarde":"") +"</td>" +
        "<td>"+ esc(a.plate||"") +"</td>" +
        "<td>"+ esc(a.car||"") +"</td>" +
        "<td>"+ esc(a.serviceType||"") +"</td>" +
        "<td>"+ esc(a.notes||"") +"</td>" +
        "<td>"+ esc((a.status||"NE").toUpperCase()) +"</td>" +
        "<td></td><td class=\"no-print\"></td>";
      tbody.appendChild(tr);
    }
  }

  // ===== Vista diária (mobile) =====
  function renderMobileDay(date){
    var label = byId("mobileDayLabel"), list = byId("mobileDayList");
    if (!label || !list) return;
    label.textContent = wdPT(date) + " • " + ddmm(date);
    list.innerHTML = "";

    var items = filteredAppointments()
      .filter(function(a){ return a.date === toISODate(date); })
      .sort(function(a,b){ return (a.period||"").localeCompare(b.period||""); });

    if (!items.length){
      var empty = document.createElement("div");
      empty.className = "appt-sub";
      empty.style.cssText = "text-align:center;opacity:.7";
      empty.textContent = "Sem serviços para este dia.";
      list.appendChild(empty);
      return;
    }
    for (var i=0;i<items.length;i++){ list.appendChild(makeCard(items[i])); }
  }

  // ===== Cartões + status mobile =====
  function makeCard(appt, unscheduled){
    var card = document.createElement("div");
    card.className = "appointment" + (unscheduled ? " unscheduled" : "");
    card.setAttribute("data-id", appt.id || "");
    var status = (appt.status || "NE").toUpperCase();
    card.setAttribute("data-status", status);

    var h = document.createElement("div");
    h.className = "appt-header";
    h.textContent = [appt.plate, appt.store].filter(Boolean).join(" • ");
    card.appendChild(h);

    var sub = document.createElement("div");
    sub.className = "appt-sub";
    sub.textContent = [appt.car, appt.serviceType ? "(" + appt.serviceType + ")" : "", appt.period ? (appt.period==="AM"?"Manhã":"Tarde") : ""]
      .filter(Boolean).join(" ");
    card.appendChild(sub);

    var chip = document.createElement("span");
    chip.className = "chip " + chipClass(status);
    chip.textContent = status;
    card.appendChild(chip);

    // Pintar cartão no mobile
    if (matchMedia("(max-width: 820px)").matches){
      paintCard(card, status);
      // controlos NE/VE/ST no mobile
      var ctrl = document.createElement("div");
      ctrl.className = "appt-status-controls";
      ["NE","VE","ST"].forEach(function(code){
        var b = document.createElement("button");
        b.className = "status-btn " + code + (code===status?" is-active":"");
        b.type = "button";
        b.textContent = code;
        b.addEventListener("click", function(ev){
          ev.stopPropagation();
          onStatusClick(card, code, ctrl);
        });
        ctrl.appendChild(b);
      });
      card.appendChild(ctrl);
    }
    return card;
  }

  function chipClass(s){ s=(s||"NE").toUpperCase(); return s==="VE"?"chip-VE":(s==="ST"?"chip-ST":"chip-NE"); }
  function paintCard(card, s){
    removeClass(card,"card-NE"); removeClass(card,"card-VE"); removeClass(card,"card-ST");
    if (s==="NE") addClass(card,"card-NE"); else if (s==="VE") addClass(card,"card-VE"); else if (s==="ST") addClass(card,"card-ST");
  }
  function onStatusClick(card, newStatus, ctrl){
    var id = card.getAttribute("data-id");
    if (!id){ toast("error","Falta o id do agendamento."); return; }
    var prev = (card.getAttribute("data-status") || "NE").toUpperCase();
    if (prev === newStatus) return;

    setActiveButton(ctrl, newStatus);
    // chip
    var chip = card.querySelector(".chip"); if (chip){ chip.className = "chip " + chipClass(newStatus); chip.textContent = newStatus; }
    paintCard(card, newStatus);
    card.setAttribute("data-status", newStatus);

    apiUpdateStatus(id, newStatus, function(err){
      if (err){
        // rollback
        setActiveButton(ctrl, prev);
        if (chip){ chip.className = "chip " + chipClass(prev); chip.textContent = prev; }
        paintCard(card, prev);
        card.setAttribute("data-status", prev);
        toast("error","Falha ao gravar estado.");
      } else {
        toast("success","Estado atualizado para " + newStatus + ".");
        // refletir no state
        for (var i=0;i<state.appointments.length;i++){
          if (state.appointments[i].id === id){ state.appointments[i].status = newStatus; break; }
        }
      }
    });
  }
  function setActiveButton(ctrl, status){
    var btns = ctrl ? ctrl.getElementsByClassName("status-btn") : [];
    for (var i=0;i<btns.length;i++){
      var b = btns[i];
      if (b.textContent === status) addClass(b,"is-active"); else removeClass(b,"is-active");
    }
  }

  // ===== Navegação =====
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
    var target = addDays(state.selectedDay, delta);
    var wkTarget = startOfWeek(target);
    if (wkTarget.getTime() !== state.weekStart.getTime()){
      state.weekStart = wkTarget; state.selectedDay = target; loadAndRenderWeek(state.weekStart);
    } else {
      setSelectedDay(target, false);
    }
  }
  function setSelectedDay(date, canShiftWeek){
    if (canShiftWeek){
      var wk = startOfWeek(date);
      if (wk.getTime() !== state.weekStart.getTime()){
        state.weekStart = wk; state.selectedDay = date; return loadAndRenderWeek(state.weekStart);
      }
    }
    state.selectedDay = date;
    renderMobileDay(state.selectedDay);
  }

  // ===== Filtro/agrupamento =====
  function filteredAppointments(){
    if (!state.filter) return state.appointments.slice();
    var f = state.filter;
    return state.appointments.filter(function(a){
      var hay = [a.plate,a.car,a.serviceType,a.store,a.notes,a.status,a.period,a.date].filter(Boolean).join(" ").toLowerCase();
      return hay.indexOf(f) > -1;
    });
  }
  function groupByDayPeriod(list){
    var map = new Map();
    for (var i=0;i<list.length;i++){
      var a = list[i];
      if (!a.date) continue;
      var key = a.date + "|" + ((a.period||"AM").toUpperCase());
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    }
    return map;
  }

  // ===== Helpers UI =====
  function updateWeekRangeLabel(start, end){
    var el = byId("weekRange"); if (!el) return;
    var same = start.getMonth() === end.getMonth();
    el.textContent = same
      ? pad2(start.getDate()) + "–" + pad2(end.getDate()) + " " + monthPT(start) + " " + start.getFullYear()
      : pad2(start.getDate()) + " " + monthPT(start) + " – " + pad2(end.getDate()) + " " + monthPT(end) + " " + start.getFullYear();
  }
  function setLoading(on){ if (on) addClass(document.body,"loading"); else removeClass(document.body,"loading"); }
  function toast(type, msg){
    var cont = byId("toastContainer");
    if (!cont){ cont = document.createElement("div"); cont.id = "toastContainer"; cont.className = "toast-container"; document.body.appendChild(cont); }
    var t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = msg;
    cont.appendChild(t);
    setTimeout(function(){ if (t && t.parentNode) t.parentNode.removeChild(t); }, 2400);
  }

  // ===== Datas =====
  function startOfWeek(d){ var x=new Date(d.getFullYear(),d.getMonth(),d.getDate()); var day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return x; }
  function weekDays(ws){ var a=[]; for (var i=0;i<7;i++) a.push(addDays(ws,i)); return a; }
  function addDays(d,n){ var x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function toISODate(d){ return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
  function parseISO(s){ var p=(s||"").split("-"); return new Date(+p[0],(+p[1]||1)-1,+p[2]||1); }
  function ddmm(d){ return pad2(d.getDate())+"/"+pad2(d.getMonth()+1); }
  function wdPT(d){ return ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"][(d.getDay()+6)%7]; }
  function monthPT(d){ return ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][d.getMonth()]; }
  function pad2(n){ n=String(n); return n.length===1?"0"+n:n; }
  function clampToWeek(date, start){ var s=new Date(start), e=addDays(s,6); if (date<s) return s; if (date>e) return e; return date; }

  // ===== DOM utils =====
  function byId(s){ return document.getElementById(s); }
  function addClass(el,c){ if (!el) return; if (el.classList) el.classList.add(c); }
  function removeClass(el,c){ if (!el) return; if (el.classList) el.classList.remove(c); }
  function toggleClass(el,c){ if (!el) return; if (el.classList) el.classList.toggle(c); }
  function setValue(id,v){ var el=byId(id); if (el) el.value = v; }
  function getValue(id){ var el=byId(id); return el ? el.value : ""; }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"'`=\/]/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;","/":"&#x2F;","`":"&#x60;","=":"&#x3D;"}[c]; }); }

})();