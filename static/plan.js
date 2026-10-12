var pstate = { last: null, dates: [], charts: [] };

function el(id) { return document.getElementById(id); }

function addOpt(sel, v, t) {
  var o = document.createElement("option");
  o.value = v; o.textContent = t; sel.appendChild(o);
}

function fillSel(sel, items, allLabel) {
  var cur = sel.value;
  sel.innerHTML = "";
  if (allLabel) addOpt(sel, "", allLabel);
  items.forEach(function (x) { addOpt(sel, x, x); });
  var has = false;
  for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === cur) has = true; }
  if (cur && has) sel.value = cur;
  else if (!allLabel && items.length) sel.value = items[0];
}

function fmtVal(v, pct) {
  if (v == null) return "-";
  if (pct) return (v * 100).toFixed(1) + "%";
  var a = Math.abs(v);
  if (a >= 100000) return (v / 1000).toFixed(1) + "k";
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(3);
}

function fmtNum(v) {
  if (v == null) return "-";
  var a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toLocaleString("id-ID");
}

function clearCharts() {
  pstate.charts.forEach(function (c) { c.destroy(); });
  pstate.charts = [];
}

function loadPlan() {
  var u = "/api/plan?from=" + encodeURIComponent(el("selFromP").value) + "&to=" + encodeURIComponent(el("selToP").value);
  el("planInfo").textContent = "Memuat data dari SQL...";
  fetch(u).then(function (r) { return r.json(); }).then(function (d) {
    if (d.error) { el("planInfo").textContent = d.error; clearCharts(); return; }
    if (!d.plants) { el("planInfo").textContent = "Respon server tidak valid."; return; }
    pstate.last = d;
    setDates(d.dates);
    clearCharts();
    renderBuBar(d.bus);
    var tp = d.total_pct;
    el("barRealP").textContent = fmtNum(d.total_actual);
    el("barVsP").innerHTML = "vs RP Awal <b class=\"" + (tp != null && tp >= 1 ? "up" : "") + "\">" +
      (tp == null ? "-" : fmtVal(tp, true)) + "</b>";
    var bar = el("barVsBar");
    if (bar) bar.style.width = (tp == null ? 0 : Math.min(tp, 1.3) / 1.3 * 100) + "%";
    el("planInfo").textContent = "[LIVE SQL] Realisasi = \u03A3 real_ctn (LHP) | Rencana = \u03A3 lhp_est (CPU) | " +
      d.plants.length + " pabrik | Total rencana " + fmtVal(d.total_plan, false) + " CTN \u2014 capaian " +
      (tp == null ? "-" : fmtVal(tp, true));
  }).catch(function (e) { el("planInfo").textContent = "Gagal memuat: " + e; });
}

var targetLine = {
  id: "targetLine",
  afterDatasetsDraw: function (chart) {
    var t = chart.options.plugins.targetLine || {};
    var val = t.value != null ? t.value : 95;
    var lbl = t.label != null ? t.label : "Target " + val + "%";
    var y = chart.scales.y.getPixelForValue(val);
    if (y == null || isNaN(y) || y < chart.chartArea.top || y > chart.chartArea.bottom) return;
    var ctx = chart.ctx, a = chart.chartArea;
    ctx.save();
    ctx.setLineDash([6, 4]); ctx.strokeStyle = "#c62828"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
    ctx.fillStyle = "#c62828"; ctx.textAlign = "right"; ctx.font = "11px Segoe UI";
    ctx.fillText(lbl, a.right - 4, y - 4);
    ctx.restore();
  }
};

var barLabels = {
  id: "barLabels",
  afterDatasetsDraw: function (chart) {
    var ctx = chart.ctx;
    ctx.save();
    ctx.font = "10.5px Segoe UI"; ctx.fillStyle = "#333"; ctx.textAlign = "center";
    chart.data.datasets.forEach(function (ds, di) {
      var meta = chart.getDatasetMeta(di);
      if (!meta || meta.hidden || !meta.data) return;
      meta.data.forEach(function (bar, i) {
        var v = ds.data[i];
        if (v == null) return;
        ctx.fillText(v.toFixed(1) + "%", bar.x, bar.y - 4);
      });
    });
    ctx.restore();
  }
};

function renderBuBar(bus) {
  var arr = (bus || []).map(function (b) { return { b: b, v: (b.pct != null) ? b.pct : b.avg }; })
    .filter(function (a) { return a.v != null; })
    .sort(function (x, y) { return y.v - x.v; });
  var mx = arr.length ? Math.max.apply(null, arr.map(function (a) { return a.v; })) : 0;
  var suggestedMax = Math.max(1.1, Math.max(1, mx) * 1.1) * 100;
  var chart = new Chart(el("chartBarP"), {
    type: "bar",
    data: {
      labels: arr.map(function (a) { return a.b.bu; }),
      datasets: [{
        data: arr.map(function (a) { return +(a.v * 100).toFixed(1); }),
        backgroundColor: arr.map(function (a) { return a.v >= 0.95 ? "#0d3b6b" : "#2f9e44"; }),
        borderRadius: 0,
        barPercentage: 0.72
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              var a = arr[ctx.dataIndex];
              return "capaian " + (a.v * 100).toFixed(1) + "% | rencana " + fmtVal(a.b.plan, false) +
                " CTN | realisasi " + fmtVal(a.b.actual, false) + " CTN";
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, suggestedMax: suggestedMax, ticks: { color: "#555", callback: function (v) { return v + "%"; } } },
        x: { ticks: { color: "#333", font: { weight: "600" } } }
      }
    },
    plugins: [barLabels]
  });
  pstate.charts.push(chart);
}

function setRangeP(n) {
  var ds = pstate.dates;
  if (!n || !ds.length) { el("selFromP").value = ""; el("selToP").value = ""; loadAll(); return; }
  var dt = new Date(ds[ds.length - 1] + "T00:00:00");
  dt.setMonth(dt.getMonth() - n);
  var dd = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
  var pick = ds[0];
  for (var i = 0; i < ds.length; i++) { if (ds[i] >= dd) { pick = ds[i]; break; } }
  el("selFromP").value = pick; el("selToP").value = ""; loadAll();
}

function setBulanIniP() {
  var last = (pstate.last && pstate.last.last_actual) || "";
  if (!last) { el("selFromP").value = ""; el("selToP").value = ""; loadAll(); return; }
  el("selFromP").value = last.slice(0, 7) + "-01"; el("selToP").value = last; loadAll();
}

function setDates(ds) {
  ds = ds || [];
  var first = pstate.dates.length === 0;
  pstate.dates = ds;
  if (!first) return;
  fillSel(el("selFromP"), pstate.dates, "Semua");
  fillSel(el("selToP"), pstate.dates, "Semua");
}

if (el("selFromP")) el("selFromP").onchange = function () { loadAll(); };
if (el("selToP")) el("selToP").onchange = function () { loadAll(); };

loadPlan();