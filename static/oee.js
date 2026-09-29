// ===== DASHBOARD OEE UPA (live dari query_oee_upa_2026) =====
// Biru  = OEE aktual per BU = (Sigma AT / Sigma MPT) x (Sigma AO / Sigma SO) x (Sigma GO / Sigma AO)
// Kuning = target_c_bu per BU (kolom DB, sama dengan Looker)
// Nilai tabel = Sigma live dari DB; edit angka = simulasi what-if.

var OEE_TGT = 85;

var oeeData = [];
var KEYS = ["at", "mpt", "ao", "so", "go"];
var oeeChart = null;

function safeDiv(a, b) { return b > 0 ? a / b : null; }

function oeePct(d) {
  var a = safeDiv(d.at, d.mpt), p = safeDiv(d.ao, d.so), q = safeDiv(d.go, d.ao);
  if (a == null || p == null || q == null) return null;
  return a * p * q * 100;
}

function oeeCls(p) { return p >= OEE_TGT ? "ok" : p >= 75 ? "mid" : "bad"; }
function num(v) { return (Math.round(v * 100) / 100).toLocaleString("id-ID"); }

function loadAll() { loadPlan(); loadOee(); }

function loadOee() {
  var u = "/api/oee?from=" + encodeURIComponent(el("selFromP").value) + "&to=" + encodeURIComponent(el("selToP").value);
  el("oeeInfo").textContent = "Memuat data OEE dari SQL...";
  fetch(u).then(function (r) { return r.json(); }).then(function (d) {
    if (d.error) { el("oeeInfo").textContent = d.error; return; }
    if (!d.bus) { el("oeeInfo").textContent = "Respon server OEE tidak valid."; return; }
    oeeData = d.bus;
    var t = d.total || {};
    buildOeeTable();
    updateOee();
    el("oeeInfo").textContent = "[LIVE SQL] query_oee_upa_2026 | OEE per BU = (\u03A3AT/\u03A3MPT) \u00D7 (\u03A3AO/\u03A3SO) \u00D7 (\u03A3GO/\u03A3AO) | " +
      oeeData.length + " BU | \u03A3AT " + num(t.at || 0) + " jam | \u03A3MPT " + num(t.mpt || 0) + " jam | Total OEE " +
      (t.oee == null ? "-" : (t.oee * 100).toFixed(2) + "%") + " | kuning = target_c_bu";
  }).catch(function (e) { el("oeeInfo").textContent = "Gagal memuat OEE: " + e; });
}

function buildOeeTable() {
  var t = el("oeeTbl");
  var h = "<tr><th>BU/Sektor</th><th>AT (jam)</th><th>MPT (jam)</th><th>AO</th><th>SO</th><th>GO</th><th>Target OEE</th><th>OEE</th></tr>";
  oeeData.forEach(function (d, i) {
    h += "<tr><td><b>" + d.bu + "</b></td>" +
      KEYS.map(function (k) {
        return '<td><input type="number" min="0" step="any" data-i="' + i + '" data-k="' + k + '" value="' + d[k] + '"></td>';
      }).join("") +
      '<td class="oeeNum" id="oeeT' + i + '">-</td>' +
      '<td class="oeeNum" id="oeeR' + i + '">-</td></tr>';
  });
  t.innerHTML = h;
  t.oninput = function (e) {
    var i = e.target.getAttribute("data-i"), k = e.target.getAttribute("data-k");
    if (i == null || !k) return;
    oeeData[i][k] = +e.target.value || 0;
    updateOee();
  };
}

function setKpi(id, v, sub) {
  var c = v == null ? "" : oeeCls(v);
  el("kpi" + id).className = "kpi " + c;
  el("oee" + id).textContent = v == null ? "-" : v.toFixed(1) + "%";
  el("oee" + id + "Sub").textContent = sub;
  var bar = el("oee" + id + "Bar");
  if (bar) { bar.style.width = (v == null ? 0 : Math.min(v, 100)) + "%"; bar.className = "pfill " + c; }
}

function sumK(k) { return oeeData.reduce(function (t, d) { return t + (+d[k] || 0); }, 0); }

function updateOee() {
  var A = safeDiv(sumK("at"), sumK("mpt"));
  var P = safeDiv(sumK("ao"), sumK("so"));
  var Q = safeDiv(sumK("go"), sumK("ao"));
  var O = (A != null && P != null && Q != null) ? A * P * Q * 100 : null;

  el("oeeTotal").textContent = O == null ? "-" : O.toFixed(2) + "%";
  el("kpiOee").className = "kpi " + (O == null ? "" : oeeCls(O));
  el("oeeSub").textContent = "Target: " + OEE_TGT + "% \u2022 Aktual: " + (O == null ? "-" : O.toFixed(2) + "%");

  setKpi("A", A == null ? null : A * 100, "\u03A3AT " + num(sumK("at")) + " / \u03A3MPT " + num(sumK("mpt")));
  setKpi("P", P == null ? null : P * 100, "\u03A3AO " + num(sumK("ao")) + " / \u03A3SO " + num(sumK("so")));
  setKpi("Q", Q == null ? null : Q * 100, "\u03A3GO " + num(sumK("go")) + " / \u03A3AO " + num(sumK("ao")));

  oeeData.forEach(function (d, i) {
    var p = oeePct(d), td = el("oeeR" + i);
    td.textContent = p == null ? "-" : p.toFixed(2) + "%";
    td.className = "oeeNum " + (p == null ? "" : oeeCls(p));
    var tt = el("oeeT" + i);
    tt.textContent = d.target == null ? "-" : (d.target * 100).toFixed(2) + "%";
  });

  var arr = oeeData.map(function (d) { return { m: d.bu, p: oeePct(d), t: d.target == null ? null : +(d.target * 100).toFixed(2) }; })
    .filter(function (a) { return a.p != null; })
    .sort(function (a, b) { return b.p - a.p; });
  if (oeeChart) {
    oeeChart.data.labels = arr.map(function (a) { return a.m; });
    oeeChart.data.datasets[0].data = arr.map(function (a) { return +a.p.toFixed(2); });
    oeeChart.data.datasets[1].data = arr.map(function (a) { return a.t; });
    oeeChart.update();
  }
}

function initOeeBar() {
  oeeChart = new Chart(el("oeeBar"), {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        { label: "OEE", data: [], backgroundColor: "#1e3a5f", borderRadius: 3, barPercentage: 0.7 },
        { label: "Target OEE (target_c_bu)", data: [], backgroundColor: "#f9a825", borderRadius: 3, barPercentage: 0.7 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      plugins: {
        legend: { display: true },
        targetLine: { value: OEE_TGT, label: "Target 85%" },
        tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label + ": " + ctx.parsed.y.toFixed(2) + "%"; } } }
      },
      scales: {
        y: { beginAtZero: true, suggestedMax: 110, ticks: { callback: function (v) { return v + "%"; } } }
      }
    },
    plugins: [targetLine, barLabels]
  });
}

if (typeof document !== "undefined" && typeof Chart !== "undefined") {
  initOeeBar();
  loadOee();
}
