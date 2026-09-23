var pstate = { last: null, dates: [], charts: [] };

function el(id) { return document.getElementById(id); }

function addOpt(sel, v, t) {
  var o = document.createElement("option");
  o.value = v;
  o.textContent = t;
  sel.appendChild(o);
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

function clearCharts() {
  pstate.charts.forEach(function (c) { c.destroy(); });
  pstate.charts = [];
}

function loadPlan() {
  var u = "/api/plan?from=" + encodeURIComponent(el("selFromP").value) + "&to=" + encodeURIComponent(el("selToP").value);
  el("planInfo").textContent = "Memuat data dari SQL...";
  fetch(u).then(function (r) { return r.json(); }).then(function (d) {
    if (d.error) {
      el("planInfo").textContent = d.error;
      el("chartGridP").innerHTML = "";
      clearCharts();
      return;
    }
    if (!d.plants) { el("planInfo").textContent = "Respon server tidak valid."; return; }
    renderPlanCharts(d);
    var tp = d.total_pct;
    var sk = d.skipped || [];
    var sktxt = sk.length ? (" | " + sk.length + " pabrik lain dilewati (tanpa data pembanding)") : "";
    el("planInfo").textContent = "[LIVE SQL] Rencana = \u03A3 lhp_est (CPU) | Realisasi = \u03A3 real_ctn (LHP) | Total: rencana " +
      fmtVal(d.total_plan, false) + " CTN \u2014 realisasi " + fmtVal(d.total_actual, false) +
      " CTN \u2014 capaian " + (tp == null ? "-" : fmtVal(tp, true)) +
      " | " + ((d.bus || []).length) + " BU | " + d.plants.length + " pabrik" + sktxt;
    el("planInfo").title = sk.map(function (s) { return s.kode_pabrik + " (" + s.reason + ")"; }).join("\n");
  }).catch(function (e) { el("planInfo").textContent = "Gagal memuat: " + e; });
}

var targetLine = {
  id: "targetLine",
  afterDatasetsDraw: function (chart) {
    var y = chart.scales.y.getPixelForValue(100);
    if (y == null || isNaN(y) || y < chart.chartArea.top || y > chart.chartArea.bottom) return;
    var ctx = chart.ctx, a = chart.chartArea;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "#c62828";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(a.left, y);
    ctx.lineTo(a.right, y);
    ctx.stroke();
    ctx.fillStyle = "#c62828";
    ctx.textAlign = "right";
    ctx.font = "11px Segoe UI";
    ctx.fillText("Target 100%", a.right - 4, y - 4);
    ctx.restore();
  }
};

var barLabels = {
  id: "barLabels",
  afterDatasetsDraw: function (chart) {
    var meta = chart.getDatasetMeta(0);
    if (!meta.data) return;
    var ctx = chart.ctx;
    ctx.save();
    ctx.font = "11px Segoe UI";
    ctx.fillStyle = "#333";
    ctx.textAlign = "center";
    meta.data.forEach(function (bar, i) {
      var v = chart.data.datasets[0].data[i];
      if (v == null) return;
      ctx.fillText(v.toFixed(1) + "%", bar.x, bar.y - 5);
    });
    ctx.restore();
  }
};

function renderBuBar(bus) {
  var arr = (bus || []).map(function (b) { return { b: b, v: (b.pct != null) ? b.pct : b.avg }; })
    .filter(function (a) { return a.v != null; })
    .sort(function (x, y) { return y.v - x.v; });
  var mx = arr.length ? Math.max.apply(null, arr.map(function (a) { return a.v; })) : 0;
  var suggestedMax = Math.max(110, Math.max(1, mx) * 1.1 * 100);
  var chart = new Chart(el("chartBarP"), {
    type: "bar",
    data: {
      labels: arr.map(function (a) { return a.b.bu; }),
      datasets: [{
        data: arr.map(function (a) { return +(a.v * 100).toFixed(1); }),
        backgroundColor: arr.map(function (a) { return a.v >= 1 ? "#1e3a5f" : "#2e7d32"; }),
        borderRadius: 3,
        barPercentage: 0.7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
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
        y: {
          beginAtZero: true,
          suggestedMax: suggestedMax,
          ticks: { callback: function (v) { return v + "%"; } }
        }
      }
    },
    plugins: [targetLine, barLabels]
  });
  pstate.charts.push(chart);
}

function renderPlantCard(grid, p) {
  var card = document.createElement("div");
  card.className = "card";
  var h = document.createElement("div");
  h.className = "cardh";
  var b = document.createElement("b");
  b.textContent = p.kode_pabrik;
  b.title = "Tren capaian kumulatif: \u03A3 realisasi / \u03A3 rencana s/d tanggal itu";
  h.appendChild(b);
  var st = document.createElement("span");
  st.className = "stat";
  st.textContent = "capaian " + fmtVal(p.pct != null ? p.pct : p.avg, true) + " | rencana " + fmtVal(p.plan, false) +
    " CTN | realisasi " + fmtVal(p.actual, false) + " CTN | tren kumulatif " + p.n + " tgl";
  h.appendChild(st);
  card.appendChild(h);
  var wrap = document.createElement("div");
  wrap.className = "cvcard";
  var cv = document.createElement("canvas");
  wrap.appendChild(cv);
  card.appendChild(wrap);
  grid.appendChild(card);
  var labels = p.points.map(function (q) { return q[0]; });
  var vals = p.points.map(function (q) { return +(q[1] * 100).toFixed(2); });
  var chart = new Chart(cv, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        data: vals,
        borderColor: "#1e3a5f",
        backgroundColor: "#1e3a5f",
        borderWidth: 1.7,
        pointRadius: labels.length <= 45 ? 2.4 : 0,
        pointHitRadius: 8,
        fill: false,
        tension: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return "capaian kumulatif " + ctx.parsed.y.toFixed(1) + "%"; }
          }
        }
      },
      scales: {
        y: { ticks: { callback: function (v) { return v + "%"; } } },
        x: {
          ticks: {
            maxTicksLimit: 8,
            maxRotation: 0,
            callback: function (v) {
              var lb = this.getLabelForValue(v);
              return lb.length >= 10 ? lb.slice(5, 10) : lb;
            }
          }
        }
      }
    }
  });
  pstate.charts.push(chart);
}

function renderPlanCharts(d) {
  pstate.last = d;
  pstate.dates = d.dates || [];
  fillSel(el("selFromP"), pstate.dates, "Semua");
  fillSel(el("selToP"), pstate.dates, "Semua");
  el("barTitleP").textContent = "Realisasi vs Rencana Produksi (%) antar BU";
  clearCharts();
  renderBuBar(d.bus);
  var grid = el("chartGridP");
  grid.innerHTML = "";
  var plants = d.plants || [];
  if (!plants.length) { grid.textContent = "Tidak ada data untuk filter ini."; return; }
  plants.forEach(function (p) { renderPlantCard(grid, p); });
}

function setRangeP(n) {
  var ds = pstate.dates;
  if (!n || !ds.length) { el("selFromP").value = ""; el("selToP").value = ""; loadPlan(); return; }
  var dt = new Date(ds[ds.length - 1] + "T00:00:00");
  dt.setMonth(dt.getMonth() - n);
  var dd = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
  var pick = ds[0];
  for (var i = 0; i < ds.length; i++) { if (ds[i] >= dd) { pick = ds[i]; break; } }
  el("selFromP").value = pick;
  el("selToP").value = "";
  loadPlan();
}

function setBulanIniP() {
  var last = (pstate.last && pstate.last.last_actual) || "";
  if (!last) { el("selFromP").value = ""; el("selToP").value = ""; loadPlan(); return; }
  el("selFromP").value = last.slice(0, 7) + "-01";
  el("selToP").value = last;
  loadPlan();
}

el("selFromP").onchange = loadPlan;
el("selToP").onchange = loadPlan;

loadPlan();
