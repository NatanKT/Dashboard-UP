// ===== OEE UPA (live dari query_oee_upa_2026) =====
// OEE per BU = (Sigma AT / Sigma MPT) x (Sigma AO / Sigma SO) x (Sigma GO / Sigma AO)
// Hijau = di atas baseline, biru = di bawah. Tabel = nilai live, bisa diedit (what-if).

var OEE_TGT = 85;

var oeeData = [];
var KEYS = ["at", "mpt", "ao", "so", "go"];
var oeeChart = null;

function safeDiv(a, b) { return b > 0 ? a / b : null; }
function num(v) { return (Math.round(v * 100) / 100).toLocaleString("id-ID"); }

function oeePct(d) {
  var a = safeDiv(d.at, d.mpt), p = safeDiv(d.ao, d.so), q = safeDiv(d.go, d.ao);
  if (a == null || p == null || q == null) return null;
  return a * p * q * 100;
}
function oeeCls(p) { return p >= OEE_TGT ? "ok" : p >= 75 ? "mid" : "bad"; }

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
    var up = el("lastUpd");
    if (up) up.textContent = "Data Last Updated: " + new Date().toLocaleString("id-ID");
    el("oeeInfo").textContent = "[LIVE SQL] query_oee_upa_2026 | " + oeeData.length + " BU | \u03A3AT " +
      num(t.at || 0) + " jam | \u03A3MPT " + num(t.mpt || 0) + " jam | Total OEE " +
      (t.oee == null ? "-" : (t.oee * 100).toFixed(2) + "%");
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

function sumK(k) { return oeeData.reduce(function (t, d) { return t + (+d[k] || 0); }, 0); }

function updateOee() {
  var A = safeDiv(sumK("at"), sumK("mpt"));
  var P = safeDiv(sumK("ao"), sumK("so"));
  var Q = safeDiv(sumK("go"), sumK("ao"));
  var O = (A != null && P != null && Q != null) ? A * P * Q * 100 : null;

  el("oeeTotal").textContent = O == null ? "-" : O.toFixed(2) + "%";
  el("oeeSub").innerHTML = "vs Baseline <b class=\"" + (O != null && O >= OEE_TGT ? "up" : "") + "\">" +
    (O == null ? "-" : (O >= OEE_TGT ? "\u25B2 " : "\u25BC ") + (O - OEE_TGT).toFixed(1) + "%") + "</b>";

  oeeData.forEach(function (d, i) {
    var p = oeePct(d), td = el("oeeR" + i);
    td.textContent = p == null ? "-" : p.toFixed(2) + "%";
    td.className = "oeeNum " + (p == null ? "" : oeeCls(p));
    var tt = el("oeeT" + i);
    tt.textContent = d.target == null ? "-" : (d.target * 100).toFixed(2) + "%";
  });

  var arr = oeeData.map(function (d) { return { m: d.bu, p: oeePct(d) }; })
    .filter(function (a) { return a.p != null; })
    .sort(function (a, b) { return b.p - a.p; });
  if (oeeChart) {
    oeeChart.data.labels = arr.map(function (a) { return a.m; });
    oeeChart.data.datasets[0].data = arr.map(function (a) { return +a.p.toFixed(2); });
    oeeChart.data.datasets[0].backgroundColor = arr.map(function (a) { return a.p >= OEE_TGT ? "#2f9e44" : "#0d3b6b"; });
    oeeChart.update();
  }
}

function initOeeBar() {
  oeeChart = new Chart(el("oeeBar"), {
    type: "bar",
    data: { labels: [], datasets: [{ label: "OEE", data: [], backgroundColor: "#0d3b6b", barPercentage: 0.72 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function (ctx) { return "OEE: " + ctx.parsed.y.toFixed(2) + "%"; } } }
      },
      scales: {
        y: { beginAtZero: true, suggestedMax: 100, ticks: { color: "#555", callback: function (v) { return v + "%"; } } },
        x: { ticks: { color: "#333", font: { weight: "600" } } }
      }
    },
    plugins: [barLabels]
  });
}

function syncDates(d) {
  if (d && d.dates && typeof setDates === "function") setDates(d.dates);
}

if (typeof document !== "undefined" && typeof Chart !== "undefined") {
  initOeeBar();
  loadOee();
}