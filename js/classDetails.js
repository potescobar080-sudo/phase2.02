/* Class Monitoring Hub - loads ?class=Name, shows roster, pill balances and claims. */
const params = new URLSearchParams(window.location.search);
const className = (params.get("class") || "").trim();
let classStudents = {};
let selectedId = null;
let claims = [];

requireRole(["admin", "teacher"], function (user, profile) {
  initLrnMasking();
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("backLink").href = DASHBOARDS[profile.role];

  if (!className) {
    document.getElementById("className").textContent = "No class selected";
    document.getElementById("studentList").innerHTML = '<div class="empty">Open this page from a class list (?class=Name).</div>';
    return;
  }
  document.getElementById("className").textContent = className;
  document.title = "VENDOCINE — " + className;

  database.ref("students").orderByChild("class").equalTo(className).on("value", function (snap) {
    classStudents = snap.val() || {};
    renderRoster();
    if (selectedId && classStudents[selectedId]) renderProfile(selectedId);
    loadClaims();
  }, function (e) { showToast("Students: " + e.message, true); });
});

function pillDots(left) {
  let html = '<div class="pills" aria-label="' + left + ' of 5 pills left">';
  for (let i = 1; i <= 5; i++) html += '<span class="pill' + (i <= left ? " on" : "") + '"></span>';
  return html + "</div>";
}

function renderRoster() {
  const ids = Object.keys(classStudents).sort(function (a, b) {
    return String(classStudents[a].name).localeCompare(String(classStudents[b].name));
  });
  const totalPills = ids.reduce(function (n, id) { return n + (Number(classStudents[id].pillsLeft) || 0); }, 0);
  document.getElementById("classSummary").textContent = ids.length + " students · " + totalPills + " pills remaining";
  document.getElementById("studentList").innerHTML = ids.map(function (id) {
    const s = classStudents[id];
    const left = Number(s.pillsLeft) || 0;
    return '<div class="student-item' + (id === selectedId ? " selected" : "") + '" data-id="' + escapeHtml(id) + '" tabindex="0">' +
      "<strong>" + escapeHtml(s.name) + '</strong><div class="meta">' + escapeHtml(s.gender || "") + " · age " + escapeHtml(s.age || "—") +
      '</div><div class="meta">Pills: <strong>' + left + " / 5</strong></div>" + pillDots(left) + "</div>";
  }).join("") || '<div class="empty">No students in this class.</div>';
}

function renderProfile(id) {
  const s = classStudents[id];
  if (!s) return;
  document.getElementById("profileBody").className = "";
  document.getElementById("profileBody").innerHTML =
    '<dl class="kv">' +
    "<dt>Name</dt><dd>" + escapeHtml(s.name) + "</dd>" +
    "<dt>LRN</dt><dd>" + lrnCellHtml(s.lrn) + "</dd>" +
    "<dt>Class</dt><dd>" + escapeHtml(s.class) + "</dd>" +
    "<dt>Email</dt><dd>" + escapeHtml(s.email) + "</dd>" +
    "<dt>Gender / Age</dt><dd>" + escapeHtml(s.gender) + " / " + escapeHtml(s.age) + "</dd>" +
    "<dt>Birth date</dt><dd>" + escapeHtml(s.birthDate) + "</dd>" +
    "<dt>Pills left</dt><dd>" + escapeHtml(s.pillsLeft) + " / 5 (monthly limit " + escapeHtml(s.pillsPerMonth || 5) + ")</dd>" +
    "<dt>Total claims</dt><dd>" + escapeHtml(s.totalClaims || 0) + "</dd>" +
    "<dt>Parent contact</dt><dd>" + escapeHtml(s.parentContact || "—") + "</dd>" +
    "<dt>Medical notes</dt><dd>" + escapeHtml(s.medicalNotes || "—") + "</dd>" +
    "<dt>Status</dt><dd><span class=\"badge\">" + escapeHtml(s.status || "active") + "</span></dd></dl>";
}

function loadClaims() {
  database.ref("auditLog").limitToLast(500).once("value").then(function (snap) {
    const lrns = {};
    Object.keys(classStudents).forEach(function (id) { lrns[classStudents[id].lrn] = classStudents[id].name; });
    claims = [];
    snap.forEach(function (c) {
      const v = c.val();
      if (v.studentLRN && lrns[v.studentLRN] && /DISPENSE/i.test(v.action || "")) {
        claims.push(Object.assign({ studentName: lrns[v.studentLRN] }, v));
      }
    });
    claims.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
    document.getElementById("claimsBody").innerHTML = claims.slice(0, 25).map(function (c) {
      return "<tr><td>" + escapeHtml(formatDateTime(c.timestamp)) + "</td><td>" + escapeHtml(c.studentName) +
        "</td><td>" + escapeHtml(c.targetHopper || "—") + "</td><td>" + escapeHtml(c.details) + "</td></tr>";
    }).join("") || '<tr><td colspan="4" class="empty">No recent claims for this class.</td></tr>';
  }).catch(function (e) { showToast("Claims: " + e.message, true); });
}

function selectStudent(el) {
  if (!el) return;
  selectedId = el.getAttribute("data-id");
  renderRoster();
  renderProfile(selectedId);
}

document.getElementById("studentList").addEventListener("click", function (e) {
  selectStudent(e.target.closest(".student-item"));
});
document.getElementById("studentList").addEventListener("keydown", function (e) {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectStudent(e.target.closest(".student-item")); }
});
